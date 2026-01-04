import os
import pandas as pd

TOPICS_DIR = 'material/topics'


def mark_as_sent(filename, pill_id):
    path = os.path.join(TOPICS_DIR, filename)
    df = pd.read_csv(path)
    df.loc[df['id'] == pill_id, 'Estado'] = 'sent'
    df.to_csv(path, index=False)