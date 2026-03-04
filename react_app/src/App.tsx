import React, { useState, useEffect, useMemo } from 'react';
import Map from 'react-map-gl/maplibre';
import DeckGL from '@deck.gl/react';
import { ArcLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';

// Define the TypeScript interface for final demo : using congestion risk
// interface FlowForecast {
//   route: string;
//   source_pos: [number, number];
//   target_pos: [number, number];
//   flow_mw: number;
//   limit_mw: number;
//   congestion_risk: number;
// }

interface FlowData {
  date: string;
  hour: number;
  source: string;
  target: string;
  source_pos: [number, number];
  target_pos: [number, number];
  y_pred: number[];
  y_true: number[];
}

// A free, light-themed basemap from CartoDB (no API key required)
// const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'; // Dark theme makes glowing arcs pop
const INITIAL_VIEW_STATE = { longitude: 12.5, latitude: 42.0, zoom: 4.5, pitch: 50, bearing: 0 };

export default function App() {
  const [data, setData] = useState<FlowData[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  
  // UI State
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedHour, setSelectedHour] = useState<number>(1);
  const [selectedHorizon, setSelectedHorizon] = useState<number>(1); // 1 to 6

  const [edgeMaxMap, setEdgeMaxMap] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch('/forecast.json')
      .then(res => res.json())
      .then((json: FlowData[]) => {
        const maxMap: Record<string, number> = {};
        json.forEach(d => {
          const edgeId = `${d.source}-${d.target}`;
          // Find max value across all 6 horizons in y_true and y_pred
          const localMax = Math.max(...d.y_true.map(Math.abs), ...d.y_pred.map(Math.abs));
          maxMap[edgeId] = Math.max(maxMap[edgeId] || 0, localMax);
        });
        
        setEdgeMaxMap(maxMap);
        setData(json);
        const dates = Array.from(new Set(json.map(d => d.date))).sort();
        setAvailableDates(dates);
        if (dates.length > 0) setSelectedDate(dates[0]);
      })
      .catch(err => console.error("Error loading data:", err));
  }, []);
  
  // Filter data based on UI controls
  const currentData = useMemo(() => {
    return data.filter(d => d.date === selectedDate && d.hour === selectedHour);
  }, [data, selectedDate, selectedHour]);

  // Helper to determine flow direction and thickness
  const getFlowProps = (d: FlowData, isPred: boolean) => {
    // Horizon is 1-indexed in UI, but 0-indexed in the arrays
    const array = isPred ? d.y_pred : d.y_true;
    const flowVal = array[selectedHorizon - 1]; 
    
    // If flow is negative, we swap source and target to visually reverse the direction
    const isNegative = flowVal < 0;
    const absFlow = Math.abs(flowVal);

    return {
      sourcePos: isNegative ? d.target_pos : d.source_pos,
      targetPos: isNegative ? d.source_pos : d.target_pos,
      flow: absFlow,
      originalVal: flowVal
    };
  };

  // Helper function for visual scaling : not bad but meeh
  // const getScaledWidth = (mw: number) => {
  //   const absMw = Math.abs(mw);
  //   if (absMw < 5) return 0.5; // Minimum "thread" for tiny flows
    
  //   // Power scale: x^0.35
  //   // This squashes 6000 MW significantly but keeps 50 MW vs 200 MW distinct
  //   const scaleFactor = 1.2; // Adjust this to make all lines thicker/thinner
  //   return Math.pow(absMw, 0.44) * scaleFactor;
  // };
  
  const getHybridWidth = (mw: number, edgeId: string) => {
    const absMw = Math.abs(mw);
    const edgeMax = edgeMaxMap[edgeId] || 1;
    
    // 1. GLOBAL: Aggressive power scale (x^0.25)
    // This squashes the 6000MW down so it doesn't cover the map.
    const globalBase = Math.pow(absMw, 0.36) * 1.5;

    // 2. LOCAL: Linear percentage of this edge's max
    // This ensures that even in a 50MW line, a 5MW change is VISIBLE.
    // We give this a weight (e.g., 3 pixels of "growth room").
    const localEvolution = (absMw / edgeMax) * 4;

    return globalBase + localEvolution;
  };

  const layers = [
    // Layer 1: TRUE FLOW (Thicker, sits slightly lower, Green/Red depending on Pred status)
    new ArcLayer({
      id: 'arc-true',
      data: currentData,
      getSourcePosition: (d: FlowData) => getFlowProps(d, false).sourcePos,
      getTargetPosition: (d: FlowData) => getFlowProps(d, false).targetPos,
      // Fades from transparent to solid to show direction
      getSourceColor: [50, 200, 50, 30], 
      getTargetColor: [50, 200, 50, 255],
      getWidth: (d: FlowData) => {const props = getFlowProps(d, false); return getHybridWidth(props.flow, `${d.source}-${d.target}`);},
      // widthMinPixels: 1,  // Never invisible
      // widthMaxPixels: 50, // Never overwhelming
      widthUnits: 'pixels',
      getHeight: 0.4, // Lower arc
      pickable: true,
      autoHighlight: true
    }),

    // Layer 2: PREDICTED FLOW (Thinner, sits higher, Blue/Purple)
    new ArcLayer({
      id: 'arc-pred',
      data: currentData,
      getSourcePosition: (d: FlowData) => getFlowProps(d, true).sourcePos,
      getTargetPosition: (d: FlowData) => getFlowProps(d, true).targetPos,
      getSourceColor: [50, 150, 255, 30],
      getTargetColor: [50, 150, 255, 255],
      getWidth: (d: FlowData) => {const props = getFlowProps(d, true); return getHybridWidth(props.flow, `${d.source}-${d.target}`);},
      // widthMinPixels: 1,  // Never invisible
      // widthMaxPixels: 15, // Never overwhelming
      widthUnits: 'pixels',
      getHeight: 0.6, // Higher arc to avoid z-fighting
      pickable: true,
      autoHighlight: true
    })
  ];

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        layers={layers}
        getTooltip={({ object, layer }) => {
          if (!object) return null;
          const isPredLayer = layer?.id === 'arc-pred';
          const props = getFlowProps(object, isPredLayer);
          const type = isPredLayer ? "Predicted" : "True";
          return `${object.source} ↔ ${object.target}\nType: ${type}\nHorizon: +${selectedHorizon}h\nFlow: ${props.originalVal.toFixed(2)} MW`;
        }}
      >
        <Map mapStyle={MAP_STYLE} reuseMaps />
      </DeckGL>
      
      {/* UI Overlay */}
      <div style={{ 
        position: 'absolute', top: 20, left: 20, background: 'rgba(20,20,20,0.85)', 
        color: 'white', padding: 20, borderRadius: 8, zIndex: 1, 
        fontFamily: 'sans-serif', width: '300px' 
      }}>
        <h2 style={{ margin: '0 0 15px 0', fontSize: '1.2rem' }}>Flow Horizon Explorer</h2>
        
        <div style={{ marginBottom: 15 }}>
          <label style={{ display: 'block', marginBottom: 5 }}>Date:</label>
          <select 
            value={selectedDate} 
            onChange={e => setSelectedDate(e.target.value)}
            style={{ width: '100%', padding: '5px' }}
          >
            {availableDates.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 15 }}>
          <label style={{ display: 'block', marginBottom: 5 }}>Hour of Day: {selectedHour}:00</label>
          <input 
            type="range" min="0" max="23" 
            value={selectedHour} 
            onChange={e => setSelectedHour(parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 15 }}>
          <label style={{ display: 'block', marginBottom: 5 }}>Prediction Horizon: +{selectedHorizon}h</label>
          <select 
            value={selectedHorizon} 
            onChange={e => setSelectedHorizon(parseInt(e.target.value))}
            style={{ width: '100%', padding: '5px' }}
          >
            {[1, 2, 3, 4, 5, 6].map(h => <option key={h} value={h}>+{h} hours</option>)}
          </select>
        </div>

        <div style={{ marginTop: 20, fontSize: '0.9rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
            <div style={{ width: 15, height: 15, background: 'rgb(50, 200, 50)', marginRight: 10 }}></div>
            True Flow (Lower Arc)
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 15, height: 15, background: 'rgb(50, 150, 255)', marginRight: 10 }}></div>
            Predicted Flow (Higher Arc)
          </div>
          <p style={{ color: '#aaa', fontSize: '0.8rem', marginTop: 10 }}>
            * Gradients indicate flow direction (transparent source to solid target).
          </p>
        </div>
      </div>
    </div>
  );
}