import os
import glob
import pandas as pd
import json
import re

# Approximate Longitude/Latitude for your nodes
COORDS = {
    "Calabria": [16.5944, 38.9059],
    "Sicilia": [14.0154, 37.5990],
    "Southern-Italy": [16.0, 40.5], # Naples area approx
    "Central-northern Italy": [11.2558, 43.7696], # Florence approx
    "Centeral-southern Italy": [12.4964, 41.9028], # Rome approx
    "North": [9.3900, 45.4642], # Milan approx
    "Sardegna": [8.9736, 40.1209],
    "MT": [14.3754, 35.9375], # Malta
    "FR": [4.4, 45.565], # France (Marseille)
    "AT": [11.3945, 47.2692], # Austria (Innsbruck)
    "SI": [14.5058, 46.0569], # Slovenia (Ljubljana)
    "CH": [8.2417, 47.3769], # Switzerland (Zurich)
    "ME": [19.2594, 42.4304], # Montenegro
    "GR": [21.7346, 38.2462], # Greece (Patras)
    "SACODC": [9.5, 42.5], # Corsica approx
    "SACOAC": [8.8, 42.0], # Corsica approx
}

def parse_array_string(arr_str):
    """Converts '[160.99 201.35]' to [160.99, 201.35]"""
    # Remove brackets and replace multiple spaces with a single comma
    clean_str = re.sub(r'\s+', ',', arr_str.strip('[]').strip())
    return [float(x) for x in clean_str.split(',') if x]

def process_forecasts(prediction_folder):
    all_data = []
    
    # Iterate over all CSVs in your prediction folder
    for file in glob.glob(os.path.join(prediction_folder, "*_test.csv")):
        df = pd.read_csv(file)
        print(f"Processing {file} with {len(df)} records...")
        for _, row in df.iterrows():
            # Safely parse stringified tuple "('Calabria', 'Sicilia')"
            edge_str = row['edge'].replace("'", "").strip("()")
            source, target = [x.strip() for x in edge_str.split(',')]
            
            # Skip if we don't have coords mapped
            if source not in COORDS or target not in COORDS:
                continue

            time_val = pd.to_datetime(row['time'])
            
            all_data.append({
                "date": time_val.strftime('%Y-%m-%d'),
                "hour": time_val.hour,
                "source": source,
                "target": target,
                "source_pos": COORDS[source],
                "target_pos": COORDS[target],
                "y_pred": parse_array_string(row['y_pred']),
                "y_true": parse_array_string(row['y_true'])
            })
            
    return all_data

if __name__ == "__main__":
    # Ensure this points to the folder with your CSV files
    data = process_forecasts("predictions") 
    
    output_path= "react_app/public"
    os.makedirs(output_path, exist_ok=True)
    output_path = os.path.join(output_path, "forecast.json")
    
    with open(output_path, "w") as f:
        json.dump(data, f)
        
    print(f"Processed {len(data)} records. Saved to {output_path}")