# -*- coding: utf-8 -*-
import json
import re
import openpyxl
from datetime import datetime, timedelta

# 1. Parse matches from original_worldcup.json
with open('original_worldcup.json', 'r', encoding='utf-8') as f:
    wc_data = json.load(f)

raw_matches = wc_data.get('matches', [])
matches_rows = []

# Group matches mapping to Jornadas
group_matches = {}
for m in raw_matches:
    if m.get('group'):
        g_letter = m['group'].replace('Group ', '')
        if g_letter not in group_matches:
            group_matches[g_letter] = []
        group_matches[g_letter].append(m)

# Sort matches within each group by date/time to assign Jornada 1, 2, 3
for g, m_list in group_matches.items():
    m_list.sort(key=lambda x: (x['date'], x.get('time', '')))
    for idx, match in enumerate(m_list):
        md = (idx // 2) + 1
        match['matchday'] = md
        match['round_label'] = f"Jornada {md}"

# Helper to parse kickoff time to ISO UTC string
def parse_kickoff(date_str, time_str):
    if not time_str:
        return f"{date_str}T00:00:00Z"
    m = re.match(r"(\d{2}):(\d{2})\s+UTC([+-]\d+)", time_str)
    if m:
        hh = int(m.group(1))
        mm = int(m.group(2))
        offset = int(m.group(3))
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        dt = dt.replace(hour=hh, minute=mm)
        dt_utc = dt - timedelta(hours=offset)
        return dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"{date_str}T{time_str.split(' ')[0]}:00Z"

# Build matches rows
match_id_counter = 1
for m in raw_matches:
    m_id = f"m{match_id_counter:03d}"
    match_id_counter += 1
    
    group = m.get('group', '').replace('Group ', '') if m.get('group') else None
    
    # Phase mapping
    phase = 'group'
    round_label = m.get('round', '')
    matchday = m.get('matchday')
    
    if not group:
        matchday = None
        r = m.get('round', '').lower()
        if '32' in r:
            phase = 'r32'
            round_label = 'Ronda de 32'
        elif '16' in r or 'eighth' in r:
            phase = 'r16'
            round_label = 'Octavos de Final'
        elif 'quarter' in r:
            phase = 'qf'
            round_label = 'Cuartos de Final'
        elif 'semi' in r:
            phase = 'sf'
            round_label = 'Semifinales'
        elif 'third' in r or '3rd' in r:
            phase = '3rd'
            round_label = 'Tercer Puesto'
        elif 'final' in r:
            phase = 'final'
            round_label = 'Final'
    else:
        round_label = m.get('round_label', f"Jornada {matchday}")
        phase = 'group'

    kickoff_utc = parse_kickoff(m['date'], m.get('time', ''))
    
    matches_rows.append({
        'id': m_id,
        'phase': phase,
        'group': group,
        'matchday': matchday,
        'round_label': round_label,
        'home_team': m.get('team1'),
        'away_team': m.get('team2'),
        'kickoff_utc': kickoff_utc,
        'home_score': '',
        'away_score': '',
        'status': 'scheduled',
        'is_double_points': 'FALSE',
        'api_id': ''  # Relleno por syncMatchIds() en Apps Script
    })

# Select a random match for E2 (Partido Salvaje) per matchday
import random
from collections import defaultdict
matchdays = defaultdict(list)
for m in matches_rows:
    if m['phase'] == 'group':
        matchdays[m['matchday']].append(m)

for md, md_matches in matchdays.items():
    if md_matches:
        wild_match = random.choice(md_matches)
        wild_match['is_double_points'] = 'TRUE'

# 2. Extract players from original_app.js
with open('original_app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

# Find the AWARD_PLAYERS block and extract name and country
player_matches = re.findall(r"name:\s*['\"]([^'\"]+)['\"],\s*country:\s*['\"]([^'\"]+)['\"]", app_js)
players_rows = []

goalkeepers_list = {
    'Mike Maignan', 'Brice Samba', 'Robin Risser',
    'Jordan Pickford', 'Dean Henderson', 'James Trafford',
    'Alisson', 'Ederson Moraes', 'Weverton',
    'Unai Simón', 'David Raya', 'Joan García',
    'Emiliano Martínez', 'Gerónimo Rulli', 'Juan Musso',
    'Oliver Baumann', 'Manuel Neuer', 'Alexander Nübel',
    'Diogo Costa', 'José Sá', 'Rui Silva', 'Ricardo Velho',
    'Mark Flekken', 'Robin Roefs', 'Bart Verbruggen',
    'Thibaut Courtois', 'Senne Lammens', 'Mike Penders',
    'Santiago Mele', 'Fernando Muslera', 'Sergio Rochet',
    'Dominik Livaković', 'Dominik Kotarski', 'Ivor Pandur',
    'Raúl Rangel', 'Guillermo Ochoa', 'Carlos Acevedo',
    'Camilo Vargas', 'David Ospina', 'Matt Freese', 'Chris Brady',
    'Munir El Kajoui', 'Reda Tagnaouti'
}

player_id_counter = 1
seen_players = set()

for name, country in player_matches:
    # Deduplicate
    key = (name, country)
    if key in seen_players:
        continue
    seen_players.add(key)
    
    p_id = f"pl{player_id_counter:03d}"
    player_id_counter += 1
    
    position = 'goalkeeper' if name in goalkeepers_list and not (name == 'Emiliano Martínez' and country == 'Uruguay') else 'outfield'
    
    players_rows.append({
        'id': p_id,
        'name': name,
        'team': country,
        'position': position,
        'active': 'TRUE',
        'api_name': ''  # Nombre exacto de la API football-data.org para matching robusto
    })

# 3. Define participants
participants_rows = []

# 4. Define special events
special_events_rows = [
    {
        'id': 'E1',
        'name': 'Ganador del Mundial',
        'description': '¿Qué selección ganará el Mundial 2026? (Acierto otorga +5 pts)',
        'deadline_utc': '2026-06-11T17:00:00Z',
        'is_active': 'TRUE',
        'is_resolved': 'FALSE',
        'result_description': ''
    },
    {
        'id': 'E2',
        'name': 'Partido Salvaje',
        'description': 'Un partido del mundial seleccionado aleatoriamente que otorga el doble de puntos.',
        'deadline_utc': '',
        'is_active': 'TRUE',
        'is_resolved': 'TRUE',
        'result_description': f"Partido {wild_match['id']}: {wild_match['home_team']} vs {wild_match['away_team']}"
    },
    {
        'id': 'E3',
        'name': 'El Portero Héroe',
        'description': '¿Qué portero parará un penalti en tanda de penaltis de octavos, cuartos o semis? (Acierto otorga +4 pts)',
        'deadline_utc': '2026-06-27T16:00:00Z',
        'is_active': 'TRUE',
        'is_resolved': 'FALSE',
        'result_description': ''
    },
    {
        'id': 'E4',
        'name': 'La Maldición del Favorito',
        'description': '¿Qué selección del Top 8 FIFA caerá antes de las semifinales? (Acierto otorga +3 pts)',
        'deadline_utc': '2026-06-27T16:00:00Z',
        'is_active': 'TRUE',
        'is_resolved': 'FALSE',
        'result_description': ''
    },
    {
        'id': 'E5',
        'name': 'Hat-Trick Salvaje',
        'description': '¿Qué jugador marcará un Hat-Trick (3 goles o más en un partido) durante el torneo? (Acierto otorga +5 pts)',
        'deadline_utc': '2026-06-11T17:00:00Z',
        'is_active': 'TRUE',
        'is_resolved': 'FALSE',
        'result_description': ''
    },
    {
        'id': 'E6',
        'name': 'Partido con más Goles (Eliminatorias)',
        'description': '¿Cuántos goles se marcarán en el partido con más goles de las eliminatorias? (Exacto +3 pts, a 1 de diferencia +1 pt)',
        'deadline_utc': '2026-06-27T16:00:00Z',
        'is_active': 'TRUE',
        'is_resolved': 'FALSE',
        'result_description': ''
    }
]

# Write to Excel using openpyxl
wb = openpyxl.Workbook()

# Setup sheets
# Round keys for players stats
player_rounds_headers = [
    'goals_group_md1', 'goals_group_md2', 'goals_group_md3', 'goals_r32', 'goals_r16', 'goals_qf', 'goals_sf', 'goals_3rd', 'goals_final',
    'conceded_group_md1', 'conceded_group_md2', 'conceded_group_md3', 'conceded_r32', 'conceded_r16', 'conceded_qf', 'conceded_sf', 'conceded_3rd', 'conceded_final'
]

sheets_configs = [
    ('participants', ['id', 'name', 'paid', 'password'], participants_rows),
    ('matches', ['id', 'phase', 'group', 'matchday', 'round_label', 'home_team', 'away_team', 'kickoff_utc', 'home_score', 'away_score', 'status', 'is_double_points', 'api_id'], matches_rows),
    ('players', ['id', 'name', 'team', 'position', 'active', 'api_name'] + player_rounds_headers, players_rows),
    ('special_events', ['id', 'name', 'description', 'deadline_utc', 'is_active', 'is_resolved', 'result_description'], special_events_rows),
    # Nueva hoja para snapshots de goleadores al cierre de cada jornada
    ('api_snapshots', ['round_key', 'player_api_name', 'goals_total', 'taken_at'], []),
]

for idx, (sheet_name, headers, rows) in enumerate(sheets_configs):
    if idx == 0:
        ws = wb.active
        ws.title = sheet_name
    else:
        ws = wb.create_sheet(title=sheet_name)
    
    # Write headers
    ws.append(headers)
    
    # Write data rows
    for row_data in rows:
        row_values = [row_data.get(h, '') for h in headers]
        ws.append(row_values)

wb.save('porra_mundial_db.xlsx')
print("Excel database template created successfully as porra_mundial_db.xlsx")
