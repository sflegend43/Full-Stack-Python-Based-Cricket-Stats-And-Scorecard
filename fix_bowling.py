import sqlite3
import re

bowling_styles = {
    # Pakistan
    'Babar Azam': 'Right-arm Off Break', 'Shaheen Afridi': 'Left-arm Fast', 'Mohammad Rizwan': 'None', 
    'Fakhar Zaman': 'Slow Left-arm Orthodox', 'Haris Rauf': 'Right-arm Fast', 'Shadab Khan': 'Right-arm Leg Break', 
    'Iftikhar Ahmed': 'Right-arm Off Break', 'Imad Wasim': 'Slow Left-arm Orthodox', 'Naseem Shah': 'Right-arm Fast', 
    'Hasan Ali': 'Right-arm Fast-Medium', 'Sarfaraz Ahmed': 'None', 'Imam-ul-Haq': 'Right-arm Leg Break', 
    'Mohammad Nawaz': 'Slow Left-arm Orthodox', 'Asif Ali': 'Right-arm Off Break', 'Shoaib Malik': 'Right-arm Off Break', 
    'Mohammad Amir': 'Left-arm Fast-Medium', 'Haris Sohail': 'Slow Left-arm Orthodox', 'Shan Masood': 'Right-arm Medium-Fast', 
    'Aamer Jamal': 'Right-arm Fast-Medium', 'Salman Ali Agha': 'Right-arm Off Break', 'Saud Shakeel': 'Slow Left-arm Orthodox', 
    'Usama Mir': 'Right-arm Leg Break', 'Zaman Khan': 'Right-arm Fast', 'Mohammad Haris': 'None', 'Saim Ayub': 'Right-arm Off Break',

    # India
    'Virat Kohli': 'Right-arm Medium', 'Rohit Sharma': 'Right-arm Off Break', 'Jasprit Bumrah': 'Right-arm Fast', 
    'Hardik Pandya': 'Right-arm Fast-Medium', 'Ravindra Jadeja': 'Slow Left-arm Orthodox', 'KL Rahul': 'None', 
    'Suryakumar Yadav': 'Right-arm Medium', 'Rishabh Pant': 'None', 'Mohammed Shami': 'Right-arm Fast', 
    'Mohammed Siraj': 'Right-arm Fast', 'Shubman Gill': 'Right-arm Off Break', 'Shreyas Iyer': 'Right-arm Leg Break', 
    'Ravichandran Ashwin': 'Right-arm Off Break', 'Ishan Kishan': 'None', 'Kuldeep Yadav': 'Left-arm Unorthodox Spin', 
    'Yuzvendra Chahal': 'Right-arm Leg Break', 'Axar Patel': 'Slow Left-arm Orthodox', 'Sanju Samson': 'None', 
    'Washington Sundar': 'Right-arm Off Break', 'Shardul Thakur': 'Right-arm Fast-Medium', 'Arshdeep Singh': 'Left-arm Fast-Medium', 
    'Umran Malik': 'Right-arm Fast', 'Ruturaj Gaikwad': 'Right-arm Off Break', 'Deepak Chahar': 'Right-arm Medium-Fast', 'Yashasvi Jaiswal': 'Right-arm Leg Break',

    # Australia
    'Pat Cummins': 'Right-arm Fast', 'Steve Smith': 'Right-arm Leg Break', 'David Warner': 'Right-arm Leg Break', 
    'Mitchell Starc': 'Left-arm Fast', 'Glenn Maxwell': 'Right-arm Off Break', 'Marnus Labuschagne': 'Right-arm Leg Break', 
    'Josh Hazlewood': 'Right-arm Fast-Medium', 'Travis Head': 'Right-arm Off Break', 'Adam Zampa': 'Right-arm Leg Break', 
    'Mitchell Marsh': 'Right-arm Fast-Medium', 'Cameron Green': 'Right-arm Fast-Medium', 'Alex Carey': 'None', 
    'Marcus Stoinis': 'Right-arm Medium', 'Josh Inglis': 'None', 'Sean Abbott': 'Right-arm Fast-Medium', 
    'Ashton Agar': 'Slow Left-arm Orthodox', 'Nathan Ellis': 'Right-arm Fast-Medium', 'Spencer Johnson': 'Left-arm Fast', 
    'Matthew Short': 'Right-arm Off Break', 'Tim David': 'Right-arm Off Break', 'Aaron Hardie': 'Right-arm Medium-Fast', 
    'Riley Meredith': 'Right-arm Fast', 'Jason Behrendorff': 'Left-arm Fast-Medium', 'Tanveer Sangha': 'Right-arm Leg Break', 'Jhye Richardson': 'Right-arm Fast',

    # South Africa
    'Quinton de Kock': 'None', 'Kagiso Rabada': 'Right-arm Fast', 'David Miller': 'Right-arm Off Break', 
    'Aiden Markram': 'Right-arm Off Break', 'Heinrich Klaasen': 'Right-arm Off Break', 'Rassie van der Dussen': 'Right-arm Leg Break', 
    'Anrich Nortje': 'Right-arm Fast', 'Lungi Ngidi': 'Right-arm Fast-Medium', 'Marco Jansen': 'Left-arm Fast', 
    'Keshav Maharaj': 'Slow Left-arm Orthodox', 'Tabraiz Shamsi': 'Left-arm Unorthodox Spin', 'Reeza Hendricks': 'Right-arm Off Break', 
    'Temba Bavuma': 'Right-arm Medium', 'Gerald Coetzee': 'Right-arm Fast', 'Wayne Parnell': 'Left-arm Fast-Medium', 
    'Tristan Stubbs': 'Right-arm Off Break', 'Andile Phehlukwayo': 'Right-arm Medium-Fast', 'Sisanda Magala': 'Right-arm Fast-Medium', 
    'Lizaad Williams': 'Right-arm Fast-Medium', 'Bjorn Fortuin': 'Slow Left-arm Orthodox', 'Donovan Ferreira': 'Right-arm Off Break', 
    'Nandre Burger': 'Left-arm Fast', 'Ryan Rickelton': 'None', 'Wiaan Mulder': 'Right-arm Medium', 'Dewald Brevis': 'Right-arm Leg Break',

    # New Zealand
    'Kane Williamson': 'Right-arm Off Break', 'Trent Boult': 'Left-arm Fast-Medium', 'Tim Southee': 'Right-arm Medium-Fast', 
    'Devon Conway': 'None', 'Daryl Mitchell': 'Right-arm Medium', 'Glenn Phillips': 'Right-arm Off Break', 
    'Mitchell Santner': 'Slow Left-arm Orthodox', 'Lockie Ferguson': 'Right-arm Fast', 'Tom Latham': 'None', 
    'Matt Henry': 'Right-arm Fast-Medium', 'Rachin Ravindra': 'Slow Left-arm Orthodox', 'James Neesham': 'Right-arm Medium-Fast', 
    'Ish Sodhi': 'Right-arm Leg Break', 'Mark Chapman': 'Slow Left-arm Orthodox', 'Finn Allen': 'None', 
    'Will Young': 'Right-arm Off Break', 'Adam Milne': 'Right-arm Fast', 'Kyle Jamieson': 'Right-arm Fast-Medium', 
    'Tim Seifert': 'None', 'Michael Bracewell': 'Right-arm Off Break', 'Henry Nicholls': 'Right-arm Off Break', 
    'Blair Tickner': 'Right-arm Fast-Medium', 'Ben Lister': 'Left-arm Medium-Fast', 'Jacob Duffy': 'Right-arm Fast-Medium', 'Cole McConchie': 'Right-arm Off Break',

    # England
    'Jos Buttler': 'None', 'Joe Root': 'Right-arm Off Break', 'Ben Stokes': 'Right-arm Fast-Medium', 'Jonny Bairstow': 'None', 
    'Mark Wood': 'Right-arm Fast', 'Jofra Archer': 'Right-arm Fast', 'Adil Rashid': 'Right-arm Leg Break', 
    'Moeen Ali': 'Right-arm Off Break', 'Chris Woakes': 'Right-arm Fast-Medium', 'Sam Curran': 'Left-arm Medium-Fast', 
    'Harry Brook': 'Right-arm Medium', 'Dawid Malan': 'Right-arm Leg Break', 'Liam Livingstone': 'Right-arm Leg Break', 
    'Reece Topley': 'Left-arm Fast-Medium', 'David Willey': 'Left-arm Fast-Medium', 'Phil Salt': 'None', 
    'Will Jacks': 'Right-arm Off Break', 'Gus Atkinson': 'Right-arm Fast', 'Ben Duckett': 'Right-arm Leg Break', 
    'Brydon Carse': 'Right-arm Fast', 'Matthew Potts': 'Right-arm Fast-Medium', 'Rehan Ahmed': 'Right-arm Leg Break', 
    'John Turner': 'Right-arm Fast-Medium', 'Luke Wood': 'Left-arm Fast', 'Tom Hartley': 'Slow Left-arm Orthodox',

    # West Indies
    'Nicholas Pooran': 'None', 'Andre Russell': 'Right-arm Fast', 'Jason Holder': 'Right-arm Fast-Medium', 'Shai Hope': 'None', 
    'Rovman Powell': 'Right-arm Medium', 'Alzarri Joseph': 'Right-arm Fast', 'Kyle Mayers': 'Right-arm Medium', 
    'Akeal Hosein': 'Slow Left-arm Orthodox', 'Romario Shepherd': 'Right-arm Fast-Medium', 'Shimron Hetmyer': 'None', 
    'Brandon King': 'None', 'Johnson Charles': 'None', 'Obed McCoy': 'Left-arm Fast-Medium', 'Gudakesh Motie': 'Slow Left-arm Orthodox', 
    'Sherfane Rutherford': 'Right-arm Medium-Fast', 'Shamar Joseph': 'Right-arm Fast', 'Oshane Thomas': 'Right-arm Fast', 
    'Keemo Paul': 'Right-arm Fast-Medium', 'Roston Chase': 'Right-arm Off Break', 'Shamarh Brooks': 'Right-arm Leg Break', 
    'Keacy Carty': 'Right-arm Medium', 'Matthew Forde': 'Right-arm Medium-Fast', 'Justin Greaves': 'Right-arm Medium-Fast', 
    'Alick Athanaze': 'Right-arm Off Break', 'Yannic Cariah': 'Right-arm Leg Break',

    # Sri Lanka
    'Wanindu Hasaranga': 'Right-arm Leg Break', 'Pathum Nissanka': 'None', 'Kusal Mendis': 'None', 
    'Maheesh Theekshana': 'Right-arm Off Break', 'Dushmantha Chameera': 'Right-arm Fast', 'Charith Asalanka': 'Right-arm Off Break', 
    'Dasun Shanaka': 'Right-arm Medium', 'Matheesha Pathirana': 'Right-arm Fast', 'Dilshan Madushanka': 'Left-arm Fast-Medium', 
    'Dhananjaya de Silva': 'Right-arm Off Break', 'Sadeera Samarawickrama': 'None', 'Dunith Wellalage': 'Slow Left-arm Orthodox', 
    'Kasun Rajitha': 'Right-arm Medium-Fast', 'Lahiru Kumara': 'Right-arm Fast', 'Pramod Madushan': 'Right-arm Medium-Fast', 
    'Bhanuka Rajapaksa': 'Right-arm Medium', 'Angelo Mathews': 'Right-arm Medium', 'Nuwan Thushara': 'Right-arm Medium-Fast', 
    'Chamika Karunaratne': 'Right-arm Fast-Medium', 'Kusal Perera': 'None', 'Akila Dananjaya': 'Right-arm Off Break', 
    'Binura Fernando': 'Left-arm Medium-Fast', 'Kamindu Mendis': 'Right-arm Off Break', 'Ashen Bandara': 'Right-arm Leg Break', 'Dushan Hemantha': 'Right-arm Leg Break',

    # Bangladesh
    'Shakib Al Hasan': 'Slow Left-arm Orthodox', 'Mustafizur Rahman': 'Left-arm Fast-Medium', 'Mushfiqur Rahim': 'None', 
    'Mahmudullah': 'Right-arm Off Break', 'Litton Das': 'None', 'Taskin Ahmed': 'Right-arm Fast', 
    'Najmul Hossain Shanto': 'Right-arm Off Break', 'Mehidy Hasan Miraz': 'Right-arm Off Break', 'Shoriful Islam': 'Left-arm Medium-Fast', 
    'Towhid Hridoy': 'Right-arm Off Break', 'Hasan Mahmud': 'Right-arm Fast-Medium', 'Afif Hossain': 'Right-arm Off Break', 
    'Soumya Sarkar': 'Right-arm Medium-Fast', 'Tanzid Hasan': 'None', 'Nasum Ahmed': 'Slow Left-arm Orthodox', 
    'Mahedi Hasan': 'Right-arm Off Break', 'Rishad Hossain': 'Right-arm Leg Break', 'Tanzim Hasan Sakib': 'Right-arm Fast-Medium', 
    'Taijul Islam': 'Slow Left-arm Orthodox', 'Nurul Hasan': 'None', 'Shamim Hossain': 'Right-arm Off Break', 
    'Ebadot Hossain': 'Right-arm Fast-Medium', 'Mrittunjoy Chowdhury': 'Left-arm Fast-Medium', 'Rony Talukdar': 'Right-arm Medium', 'Parvez Hossain Emon': 'None',

    # Afghanistan
    'Rashid Khan': 'Right-arm Leg Break', 'Rahmanullah Gurbaz': 'None', 'Mohammad Nabi': 'Right-arm Off Break', 
    'Mujeeb Ur Rahman': 'Right-arm Off Break', 'Fazalhaq Farooqi': 'Left-arm Fast-Medium', 'Ibrahim Zadran': 'Right-arm Medium-Fast', 
    'Naveen-ul-Haq': 'Right-arm Medium-Fast', 'Hashmatullah Shahidi': 'Right-arm Off Break', 'Najibullah Zadran': 'Right-arm Off Break', 
    'Azmatullah Omarzai': 'Right-arm Medium-Fast', 'Noor Ahmad': 'Left-arm Unorthodox Spin', 'Gulbadin Naib': 'Right-arm Medium-Fast', 
    'Rahmat Shah': 'Right-arm Leg Break', 'Fareed Ahmad': 'Left-arm Fast-Medium', 'Karim Janat': 'Right-arm Medium', 
    'Hazratullah Zazai': 'Slow Left-arm Orthodox', 'Qais Ahmad': 'Right-arm Leg Break', 'Mohammad Saleem': 'Right-arm Fast', 
    'Wafadar Momand': 'Right-arm Medium-Fast', 'Ikram Alikhil': 'None', 'Riaz Hassan': 'None', 
    'Sharafuddin Ashraf': 'Slow Left-arm Orthodox', 'Darwish Rasooli': 'Right-arm Off Break', 'Sediqullah Atal': 'None', 'Zahir Khan': 'Left-arm Unorthodox Spin'
}

try:
    conn = sqlite3.connect('cricket_stats.db')
    cursor = conn.cursor()
    for player, bstyle in bowling_styles.items():
        cursor.execute('UPDATE Players SET bowlingStyle = ? WHERE playerName = ?', (bstyle, player))
    conn.commit()
    print('DB updated.')
except Exception as e:
    print('DB error:', e)

try:
    with open('seed_data.py', 'r', encoding='utf-8') as f:
        content = f.read()

    def replacer(match):
        prefix, name, mid1, bstyle, mid2 = match.groups()
        if name in bowling_styles:
            return f"{prefix}{name}{mid1}'{bowling_styles[name]}'{mid2}"
        return match.group(0)

    # regex groups:
    # 1: start up to name -> (,\s*')
    # 2: name -> ([^']+)
    # 3: mid up to bowling style -> ('\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*)
    # 4: bowling style -> (['][^']+['])
    # 5: mid up to end -> (\s*,\s*'[^']+'\s*\))
    new_content = re.sub(
        r"(,\s*')([^']+)('\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*)(['][^']+['])(\s*,\s*'[^']+'\s*\))",
        replacer, 
        content
    )

    with open('seed_data.py', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('seed_data.py updated.')
except Exception as e:
    print('File error:', e)
