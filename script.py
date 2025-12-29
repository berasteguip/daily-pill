from datetime import datetime, timezone

days = {
    'Monday': 'art_culture',
    'Tuesday': 'geography', 
    'Wednesday': 'history', 
    'Thursday': 'nature', 
    'Friday': 'politics_econ', 
    'Saturday': 'science_tech',
    'Sunday': 'sayings'
}

def main():
    now = datetime.now(timezone.utc)
    day = now.strftime("%A")
    topic = days[day]
    string = f"UTC now: {now}, Topic: {topic}"
    print(string)
    with open("history.txt", "a") as f:
        f.write(string + "\n")

if __name__ == "__main__":
    main()
