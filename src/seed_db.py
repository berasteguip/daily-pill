import os
import csv
import glob
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

# Initialize Supabase client
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")

if not url or not key:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in the .env file")

supabase: Client = create_client(url, key)

def seed_pills():
    """
    Reads CSV files from material/topics/ and seeds the pills table.
    WARNING: Clears existing data in the pills table first.
    """
    print("Starting database seeding...")

    # Clear existing data
    # Note: DELETE without where clause deletes all rows. 
    # We might want to be careful here in production, but for seeding it's what was requested.
    try:
        print("Cleaning existing pills...")
        supabase.table("pills").delete().neq("id", -1).execute() # Hack to delete all since delete() requires a filter
    except Exception as e:
        print(f"Warning during cleanup: {e}")

    # Path to CSV files
    topics_dir = Path("material/topics")
    csv_files = glob.glob(str(topics_dir / "*.csv"))
    
    if not csv_files:
        print("No CSV files found in material/topics/")
        return

    total_inserted = 0

    for csv_file in csv_files:
        category = Path(csv_file).stem # 'history' from 'history.csv'
        print(f"Processing category: {category}")
        
        with open(csv_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            
            pills_data = []
            for row in reader:
                # Map CSV columns to Database columns
                # CSV: id,Titulo,Contenido,Estado
                # DB: title, content, category
                
                title = row.get("Titulo")
                content = row.get("Contenido")
                
                if title and content:
                    pills_data.append({
                        "title": title,
                        "content": content,
                        "category": category
                    })
            
            if pills_data:
                try:
                    # Insert in batches if necessary, but for this size, single batch per file is likely fine
                    response = supabase.table("pills").insert(pills_data).execute()
                    inserted_count = len(response.data) if response.data else 0
                    print(f"  Inserted {inserted_count} pills for {category}")
                    total_inserted += inserted_count
                except Exception as e:
                    print(f"  Error inserting {category}: {e}")

    print(f"Seeding complete. Total pills inserted: {total_inserted}")

if __name__ == "__main__":
    seed_pills()
