import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, "src")
DATA = os.path.join(BASE, "data")
OUT_DIR = os.path.join(BASE, "dist")

parts = [
    "part1_head.html",
    "part2_body.html",
    "part3_script_top.html",
    "part3c_firebase.html",
    "part3b_ronde.html",
    "part4_teams.html",
    "part6_clubs.html",
    "part5_rest.html",
]

html = "\n".join(open(os.path.join(SRC, p), encoding="utf-8").read() for p in parts)

spelregels = json.load(open(os.path.join(DATA, "spelregels.json"), encoding="utf-8"))
players = json.load(open(os.path.join(DATA, "players.json"), encoding="utf-8"))
teams = json.load(open(os.path.join(DATA, "teams.json"), encoding="utf-8"))
allweeks = json.load(open(os.path.join(DATA, "allweeks.json"), encoding="utf-8"))
tussenstand = json.load(open(os.path.join(DATA, "tussenstand.json"), encoding="utf-8"))

html = html.replace("__SPELREGELS_JSON__", json.dumps(spelregels))
html = html.replace("__CLUBS_JSON__", json.dumps(players["clubs"]))
html = html.replace("__PLAYERS_JSON__", json.dumps(players["players"]))
html = html.replace("__TEAMS_JSON__", json.dumps(teams))
html = html.replace("__ALLWEEKS_JSON__", json.dumps(allweeks))
html = html.replace("__TUSSENSTAND_JSON__", json.dumps(tussenstand))

os.makedirs(OUT_DIR, exist_ok=True)
out_path = os.path.join(OUT_DIR, "index.html")
with open(out_path, "w", encoding="utf-8") as f:
    f.write(html)

print("OK, bytes:", len(html), "->", out_path)
