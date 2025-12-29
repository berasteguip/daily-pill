from datetime import datetime, timezone

def main():
    now = datetime.now(timezone.utc).isoformat()
    string = f"UTC now: {now}"
    print(string)
    with open("history.txt", "a") as f:
        f.write(string + "\n")

if __name__ == "__main__":
    main()
