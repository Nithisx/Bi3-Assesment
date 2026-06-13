import pandas as pd
import numpy as np
import re
from datetime import datetime

# -----------------------------
# Load Data
# -----------------------------
# Replace with your file path
df = pd.read_csv("customer_feedback_raw 1.csv")

# Standardize column names
df.columns = df.columns.str.strip().str.lower()

# -----------------------------
# 1. Remove Duplicate Messages
# -----------------------------
df['feedback_text'] = df['feedback_text'].astype(str).str.strip().str.lower()

df = df.drop_duplicates(subset=['feedback_text'])

# -----------------------------
# 2. Remove Empty / Meaningless Feedback
# -----------------------------
def is_meaningful(text):
    if pd.isna(text):
        return False
    
    text = text.strip().lower()
    
    # Remove empty, short, or generic noise
    if text == "" or len(text) < 5:
        return False
    
    # Remove repeated characters like "oooo", "cooome"
    text = re.sub(r'(.)\1{2,}', r'\1', text)
    
    # Remove meaningless patterns
    meaningless_patterns = [
        r'^\W+$',           # only symbols
        r'^(ok|fine|good)$' # too generic
    ]
    
    for pattern in meaningless_patterns:
        if re.match(pattern, text):
            return False
    
    return True

df = df[df['feedback_text'].apply(is_meaningful)]

# -----------------------------
# 3. Fix Inconsistent Timestamps
# -----------------------------
def parse_date(date):
    try:
        return pd.to_datetime(date, errors='coerce')
    except:
        return np.nan

df['timestamp'] = df['timestamp'].apply(parse_date)

# Drop rows where timestamp is invalid
df = df.dropna(subset=['timestamp'])

# Convert to standard format
df['timestamp'] = df['timestamp'].dt.strftime('%Y-%m-%d')

# -----------------------------
# 4. Clean Text (optional but pro-level)
# -----------------------------
def clean_text(text):
    text = text.lower()
    
    # Remove extra spaces
    text = re.sub(r'\s+', ' ', text)
    
    # Remove order IDs
    text = re.sub(r'\(order.*?\)', '', text)
    
    # Remove special characters
    text = re.sub(r'[^\w\s]', '', text)
    
    return text.strip()

df['feedback_text'] = df['feedback_text'].apply(clean_text)

# -----------------------------
# 5. Final Clean Table
# -----------------------------
clean_df = df[['id', 'timestamp', 'source', 'rating', 'feedback_text']]

# Sort by date
clean_df = clean_df.sort_values(by='timestamp')

# Reset index
clean_df.reset_index(drop=True, inplace=True)

# -----------------------------
# Save Clean Data
# -----------------------------
clean_df.to_csv("clean_feedback.csv", index=False)

print("[SUCCESS] Data cleaned successfully!")
print(clean_df.head())