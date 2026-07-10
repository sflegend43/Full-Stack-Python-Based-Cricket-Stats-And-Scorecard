import sqlite3
import re

dobs = {
    # Pakistan
    'Babar Azam': '1994-10-15', 'Shaheen Afridi': '2000-04-06', 'Mohammad Rizwan': '1992-06-01', 
    'Fakhar Zaman': '1990-04-10', 'Haris Rauf': '1993-11-07', 'Shadab Khan': '1998-10-04', 
    'Iftikhar Ahmed': '1990-09-03', 'Imad Wasim': '1988-12-18', 'Naseem Shah': '2003-02-15', 
    'Hasan Ali': '1994-07-02', 'Sarfaraz Ahmed': '1987-05-22', 'Imam-ul-Haq': '1995-12-22', 
    'Mohammad Nawaz': '1994-03-21', 'Asif Ali': '1991-10-01', 'Shoaib Malik': '1982-02-01', 
    'Mohammad Amir': '1992-04-13', 'Haris Sohail': '1989-01-09', 'Shan Masood': '1989-10-14', 
    'Aamer Jamal': '1996-07-05', 'Salman Ali Agha': '1993-11-23', 'Saud Shakeel': '1995-09-05', 
    'Usama Mir': '1995-12-23', 'Zaman Khan': '2001-09-10', 'Mohammad Haris': '2001-03-30', 'Saim Ayub': '2002-05-24',

    # India
    'Virat Kohli': '1988-11-05', 'Rohit Sharma': '1987-04-30', 'Jasprit Bumrah': '1993-12-06', 
    'Hardik Pandya': '1993-10-11', 'Ravindra Jadeja': '1988-12-06', 'KL Rahul': '1992-04-18', 
    'Suryakumar Yadav': '1990-09-14', 'Rishabh Pant': '1997-10-04', 'Mohammed Shami': '1990-09-03', 
    'Mohammed Siraj': '1994-03-13', 'Shubman Gill': '1999-09-08', 'Shreyas Iyer': '1994-12-06', 
    'Ravichandran Ashwin': '1986-09-17', 'Ishan Kishan': '1998-07-18', 'Kuldeep Yadav': '1994-12-14', 
    'Yuzvendra Chahal': '1990-07-23', 'Axar Patel': '1994-01-20', 'Sanju Samson': '1994-11-11', 
    'Washington Sundar': '1999-10-05', 'Shardul Thakur': '1991-10-16', 'Arshdeep Singh': '1999-02-05', 
    'Umran Malik': '1999-11-22', 'Ruturaj Gaikwad': '1997-01-31', 'Deepak Chahar': '1992-08-07', 'Yashasvi Jaiswal': '2001-12-28',

    # Australia
    'Pat Cummins': '1993-05-08', 'Steve Smith': '1989-06-02', 'David Warner': '1986-10-27', 
    'Mitchell Starc': '1990-01-30', 'Glenn Maxwell': '1988-10-14', 'Marnus Labuschagne': '1994-06-22', 
    'Josh Hazlewood': '1991-01-08', 'Travis Head': '1993-12-29', 'Adam Zampa': '1992-03-31', 
    'Mitchell Marsh': '1991-10-20', 'Cameron Green': '1999-06-03', 'Alex Carey': '1991-08-27', 
    'Marcus Stoinis': '1989-08-16', 'Josh Inglis': '1995-03-04', 'Sean Abbott': '1992-02-29', 
    'Ashton Agar': '1993-10-14', 'Nathan Ellis': '1994-09-22', 'Spencer Johnson': '1995-12-16', 
    'Matthew Short': '1995-11-08', 'Tim David': '1996-03-16', 'Aaron Hardie': '1999-01-07', 
    'Riley Meredith': '1996-06-21', 'Jason Behrendorff': '1990-04-20', 'Tanveer Sangha': '2001-11-26', 'Jhye Richardson': '1996-09-20',

    # South Africa
    'Quinton de Kock': '1992-12-17', 'Kagiso Rabada': '1995-05-25', 'David Miller': '1989-06-10', 
    'Aiden Markram': '1994-10-04', 'Heinrich Klaasen': '1991-07-30', 'Rassie van der Dussen': '1989-02-07', 
    'Anrich Nortje': '1993-11-16', 'Lungi Ngidi': '1996-03-29', 'Marco Jansen': '2000-05-01', 
    'Keshav Maharaj': '1990-02-07', 'Tabraiz Shamsi': '1990-02-18', 'Reeza Hendricks': '1989-08-14', 
    'Temba Bavuma': '1990-05-17', 'Gerald Coetzee': '2000-10-02', 'Wayne Parnell': '1989-07-30', 
    'Tristan Stubbs': '2000-08-14', 'Andile Phehlukwayo': '1996-03-03', 'Sisanda Magala': '1991-01-07', 
    'Lizaad Williams': '1993-10-01', 'Bjorn Fortuin': '1994-10-21', 'Donovan Ferreira': '1998-07-21', 
    'Nandre Burger': '1995-08-11', 'Ryan Rickelton': '1996-07-11', 'Wiaan Mulder': '1998-02-19', 'Dewald Brevis': '2003-04-29',

    # New Zealand
    'Kane Williamson': '1990-08-08', 'Trent Boult': '1989-07-22', 'Tim Southee': '1988-12-11', 
    'Devon Conway': '1991-07-08', 'Daryl Mitchell': '1991-05-20', 'Glenn Phillips': '1996-12-06', 
    'Mitchell Santner': '1992-02-05', 'Lockie Ferguson': '1991-06-13', 'Tom Latham': '1992-04-02', 
    'Matt Henry': '1991-12-14', 'Rachin Ravindra': '1999-11-18', 'James Neesham': '1990-09-17', 
    'Ish Sodhi': '1992-10-31', 'Mark Chapman': '1994-06-27', 'Finn Allen': '1999-04-22', 
    'Will Young': '1992-11-22', 'Adam Milne': '1992-04-13', 'Kyle Jamieson': '1994-12-30', 
    'Tim Seifert': '1994-12-14', 'Michael Bracewell': '1991-02-14', 'Henry Nicholls': '1991-11-15', 
    'Blair Tickner': '1993-10-13', 'Ben Lister': '1996-01-01', 'Jacob Duffy': '1994-08-02', 'Cole McConchie': '1992-01-12',

    # England
    'Jos Buttler': '1990-09-08', 'Joe Root': '1990-12-30', 'Ben Stokes': '1991-06-04', 
    'Jonny Bairstow': '1989-09-26', 'Mark Wood': '1990-01-11', 'Jofra Archer': '1995-04-01', 
    'Adil Rashid': '1988-02-17', 'Moeen Ali': '1987-06-18', 'Chris Woakes': '1989-03-02', 
    'Sam Curran': '1998-06-03', 'Harry Brook': '1999-02-22', 'Dawid Malan': '1987-09-03', 
    'Liam Livingstone': '1993-08-04', 'Reece Topley': '1994-02-21', 'David Willey': '1990-02-28', 
    'Phil Salt': '1996-08-28', 'Will Jacks': '1998-11-21', 'Gus Atkinson': '1998-01-19', 
    'Ben Duckett': '1994-10-17', 'Brydon Carse': '1995-07-31', 'Matthew Potts': '1998-10-29', 
    'Rehan Ahmed': '2004-08-13', 'John Turner': '2001-04-10', 'Luke Wood': '1995-08-02', 'Tom Hartley': '1999-05-03',

    # West Indies
    'Nicholas Pooran': '1995-10-02', 'Andre Russell': '1988-04-29', 'Jason Holder': '1991-11-05', 
    'Shai Hope': '1993-11-10', 'Rovman Powell': '1993-07-23', 'Alzarri Joseph': '1996-11-20', 
    'Kyle Mayers': '1992-09-08', 'Akeal Hosein': '1993-04-25', 'Romario Shepherd': '1994-11-26', 
    'Shimron Hetmyer': '1996-12-26', 'Brandon King': '1994-12-16', 'Johnson Charles': '1989-01-14', 
    'Obed McCoy': '1997-01-04', 'Gudakesh Motie': '1995-03-29', 'Sherfane Rutherford': '1998-08-15', 
    'Shamar Joseph': '1999-08-31', 'Oshane Thomas': '1997-02-18', 'Keemo Paul': '1998-02-21', 
    'Roston Chase': '1992-03-22', 'Shamarh Brooks': '1988-10-01', 'Keacy Carty': '1997-03-19', 
    'Matthew Forde': '2002-04-29', 'Justin Greaves': '1994-02-26', 'Alick Athanaze': '1998-12-07', 'Yannic Cariah': '1992-06-22',

    # Sri Lanka
    'Wanindu Hasaranga': '1997-07-29', 'Pathum Nissanka': '1998-05-18', 'Kusal Mendis': '1995-02-02', 
    'Maheesh Theekshana': '2000-08-01', 'Dushmantha Chameera': '1992-01-11', 'Charith Asalanka': '1997-06-29', 
    'Dasun Shanaka': '1991-09-09', 'Matheesha Pathirana': '2002-12-18', 'Dilshan Madushanka': '2000-09-18', 
    'Dhananjaya de Silva': '1991-09-06', 'Sadeera Samarawickrama': '1995-08-30', 'Dunith Wellalage': '2003-01-09', 
    'Kasun Rajitha': '1993-06-01', 'Lahiru Kumara': '1997-02-13', 'Pramod Madushan': '1993-12-14', 
    'Bhanuka Rajapaksa': '1991-10-24', 'Angelo Mathews': '1987-06-02', 'Nuwan Thushara': '1994-08-06', 
    'Chamika Karunaratne': '1996-05-29', 'Kusal Perera': '1990-08-17', 'Akila Dananjaya': '1993-10-04', 
    'Binura Fernando': '1995-07-12', 'Kamindu Mendis': '1998-09-30', 'Ashen Bandara': '1998-11-23', 'Dushan Hemantha': '1994-05-24',

    # Bangladesh
    'Shakib Al Hasan': '1987-03-24', 'Mustafizur Rahman': '1995-09-06', 'Mushfiqur Rahim': '1987-05-09', 
    'Mahmudullah': '1986-02-04', 'Litton Das': '1994-10-13', 'Taskin Ahmed': '1995-04-03', 
    'Najmul Hossain Shanto': '1998-08-25', 'Mehidy Hasan Miraz': '1997-10-25', 'Shoriful Islam': '2001-06-03', 
    'Towhid Hridoy': '2000-12-04', 'Hasan Mahmud': '1999-10-12', 'Afif Hossain': '1999-09-22', 
    'Soumya Sarkar': '1993-02-25', 'Tanzid Hasan': '2000-12-01', 'Nasum Ahmed': '1994-12-05', 
    'Mahedi Hasan': '1994-12-12', 'Rishad Hossain': '2002-07-15', 'Tanzim Hasan Sakib': '2002-10-20', 
    'Taijul Islam': '1992-02-07', 'Nurul Hasan': '1993-11-21', 'Shamim Hossain': '2000-09-02', 
    'Ebadot Hossain': '1994-01-07', 'Mrittunjoy Chowdhury': '2001-06-28', 'Rony Talukdar': '1990-10-10', 'Parvez Hossain Emon': '2002-06-12',

    # Afghanistan
    'Rashid Khan': '1998-09-20', 'Rahmanullah Gurbaz': '2001-11-28', 'Mohammad Nabi': '1985-01-01', 
    'Mujeeb Ur Rahman': '2001-03-28', 'Fazalhaq Farooqi': '2000-09-22', 'Ibrahim Zadran': '2001-12-12', 
    'Naveen-ul-Haq': '1999-09-23', 'Hashmatullah Shahidi': '1994-11-04', 'Najibullah Zadran': '1993-02-28', 
    'Azmatullah Omarzai': '2000-03-24', 'Noor Ahmad': '2005-01-03', 'Gulbadin Naib': '1991-03-16', 
    'Rahmat Shah': '1993-07-06', 'Fareed Ahmad': '1994-08-10', 'Karim Janat': '1998-08-11', 
    'Hazratullah Zazai': '1998-03-23', 'Qais Ahmad': '2000-08-15', 'Mohammad Saleem': '2002-09-09', 
    'Wafadar Momand': '2000-02-01', 'Ikram Alikhil': '2000-09-29', 'Riaz Hassan': '2002-11-07', 
    'Sharafuddin Ashraf': '1995-01-10', 'Darwish Rasooli': '1999-12-12', 'Sediqullah Atal': '2001-08-12', 'Zahir Khan': '1998-12-20'
}

try:
    conn = sqlite3.connect('cricket_stats.db')
    cursor = conn.cursor()
    for player, dob in dobs.items():
        cursor.execute('UPDATE Players SET playerDOB = ? WHERE playerName = ?', (dob, player))
    conn.commit()
    print('DB updated.')
except Exception as e:
    print('DB error:', e)

try:
    with open('seed_data.py', 'r', encoding='utf-8') as f:
        content = f.read()

    def replacer(match):
        prefix, name, mid1, old_dob, mid2 = match.groups()
        if name in dobs:
            return f"{prefix}{name}{mid1}'{dobs[name]}'{mid2}"
        return match.group(0)

    # Player tuple is: ('PF...', 'Name', 'DOB', 'Country', 'Batting', 'Bowling', 'Role')
    # Regex groups: 
    # 1: start up to name -> (,\s*')
    # 2: name -> ([^']+)
    # 3: mid up to DOB -> ('\s*,\s*)
    # 4: DOB -> (['][^']+['])
    # 5: mid up to end -> (\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*\))
    
    new_content = re.sub(
        r"(,\s*')([^']+)('\s*,\s*)(['][^']+['])(\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*\))",
        replacer, 
        content
    )

    with open('seed_data.py', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('seed_data.py updated.')
except Exception as e:
    print('File error:', e)
