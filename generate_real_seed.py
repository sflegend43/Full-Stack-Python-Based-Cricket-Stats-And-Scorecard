import json

teams = [
    ('Pakistan Cricket Team',    'Pakistan',     'Mike Hesson',       'Babar Azam',       3),
    ('Indian Cricket Team',      'India',        'Gautam Gambhir',    'Rohit Sharma',     1),
    ('Australian Cricket Team',  'Australia',    'Andrew McDonald',   'Pat Cummins',      2),
    ('South Africa Cricket Team','South Africa', 'Rob Walter',        'Temba Bavuma',     4),
    ('New Zealand Cricket Team', 'New Zealand',  'Gary Stead',        'Kane Williamson',  5),
    ('England Cricket Team',     'England',      'Brendon McCullum',  'Jos Buttler',      6),
    ('West Indies Cricket Team', 'West Indies',  'Daren Sammy',       'Rovman Powell',    7),
    ('Sri Lanka Cricket Team',   'Sri Lanka',    'Chris Silverwood',  'Dasun Shanaka',    8),
    ('Bangladesh Cricket Team',  'Bangladesh',   'Chandika Hathurusingha','Shakib Al Hasan',9),
    ('Afghanistan Cricket Team', 'Afghanistan',  'Jonathan Trott',    'Hashmatullah Shahidi',10)
]

players_names = {
    'Pakistan': ["Babar Azam", "Shaheen Afridi", "Mohammad Rizwan", "Fakhar Zaman", "Haris Rauf", "Shadab Khan", "Iftikhar Ahmed", "Imad Wasim", "Naseem Shah", "Hasan Ali", "Sarfaraz Ahmed", "Imam-ul-Haq", "Mohammad Nawaz", "Asif Ali", "Shoaib Malik", "Mohammad Amir", "Haris Sohail", "Shan Masood", "Aamer Jamal", "Salman Ali Agha", "Saud Shakeel", "Usama Mir", "Zaman Khan", "Mohammad Haris", "Saim Ayub"],
    'India': ["Virat Kohli", "Rohit Sharma", "Jasprit Bumrah", "Hardik Pandya", "Ravindra Jadeja", "KL Rahul", "Suryakumar Yadav", "Rishabh Pant", "Mohammed Shami", "Mohammed Siraj", "Shubman Gill", "Shreyas Iyer", "Ravichandran Ashwin", "Ishan Kishan", "Kuldeep Yadav", "Yuzvendra Chahal", "Axar Patel", "Sanju Samson", "Washington Sundar", "Shardul Thakur", "Arshdeep Singh", "Umran Malik", "Ruturaj Gaikwad", "Deepak Chahar", "Yashasvi Jaiswal"],
    'Australia': ["Pat Cummins", "Steve Smith", "David Warner", "Mitchell Starc", "Glenn Maxwell", "Marnus Labuschagne", "Josh Hazlewood", "Travis Head", "Adam Zampa", "Mitchell Marsh", "Cameron Green", "Alex Carey", "Marcus Stoinis", "Josh Inglis", "Sean Abbott", "Ashton Agar", "Nathan Ellis", "Spencer Johnson", "Matthew Short", "Tim David", "Aaron Hardie", "Riley Meredith", "Jason Behrendorff", "Tanveer Sangha", "Jhye Richardson"],
    'South Africa': ["Quinton de Kock", "Kagiso Rabada", "David Miller", "Aiden Markram", "Heinrich Klaasen", "Rassie van der Dussen", "Anrich Nortje", "Lungi Ngidi", "Marco Jansen", "Keshav Maharaj", "Tabraiz Shamsi", "Reeza Hendricks", "Temba Bavuma", "Gerald Coetzee", "Wayne Parnell", "Tristan Stubbs", "Andile Phehlukwayo", "Sisanda Magala", "Lizaad Williams", "Bjorn Fortuin", "Donovan Ferreira", "Nandre Burger", "Ryan Rickelton", "Wiaan Mulder", "Dewald Brevis"],
    'New Zealand': ["Kane Williamson", "Trent Boult", "Tim Southee", "Devon Conway", "Daryl Mitchell", "Glenn Phillips", "Mitchell Santner", "Lockie Ferguson", "Tom Latham", "Matt Henry", "Rachin Ravindra", "James Neesham", "Ish Sodhi", "Mark Chapman", "Finn Allen", "Will Young", "Adam Milne", "Kyle Jamieson", "Tim Seifert", "Michael Bracewell", "Henry Nicholls", "Blair Tickner", "Ben Lister", "Jacob Duffy", "Cole McConchie"],
    'England': ["Jos Buttler", "Joe Root", "Ben Stokes", "Jonny Bairstow", "Mark Wood", "Jofra Archer", "Adil Rashid", "Moeen Ali", "Chris Woakes", "Sam Curran", "Harry Brook", "Dawid Malan", "Liam Livingstone", "Reece Topley", "David Willey", "Phil Salt", "Will Jacks", "Gus Atkinson", "Ben Duckett", "Brydon Carse", "Matthew Potts", "Rehan Ahmed", "John Turner", "Luke Wood", "Tom Hartley"],
    'West Indies': ["Nicholas Pooran", "Andre Russell", "Jason Holder", "Shai Hope", "Rovman Powell", "Alzarri Joseph", "Kyle Mayers", "Akeal Hosein", "Romario Shepherd", "Shimron Hetmyer", "Brandon King", "Johnson Charles", "Obed McCoy", "Gudakesh Motie", "Sherfane Rutherford", "Shamar Joseph", "Oshane Thomas", "Keemo Paul", "Roston Chase", "Shamarh Brooks", "Keacy Carty", "Matthew Forde", "Justin Greaves", "Alick Athanaze", "Yannic Cariah"],
    'Sri Lanka': ["Wanindu Hasaranga", "Pathum Nissanka", "Kusal Mendis", "Maheesh Theekshana", "Dushmantha Chameera", "Charith Asalanka", "Dasun Shanaka", "Matheesha Pathirana", "Dilshan Madushanka", "Dhananjaya de Silva", "Sadeera Samarawickrama", "Dunith Wellalage", "Kasun Rajitha", "Lahiru Kumara", "Pramod Madushan", "Bhanuka Rajapaksa", "Angelo Mathews", "Nuwan Thushara", "Chamika Karunaratne", "Kusal Perera", "Akila Dananjaya", "Binura Fernando", "Kamindu Mendis", "Ashen Bandara", "Dushan Hemantha"],
    'Bangladesh': ["Shakib Al Hasan", "Mustafizur Rahman", "Mushfiqur Rahim", "Mahmudullah", "Litton Das", "Taskin Ahmed", "Najmul Hossain Shanto", "Mehidy Hasan Miraz", "Shoriful Islam", "Towhid Hridoy", "Hasan Mahmud", "Afif Hossain", "Soumya Sarkar", "Tanzid Hasan", "Nasum Ahmed", "Mahedi Hasan", "Rishad Hossain", "Tanzim Hasan Sakib", "Taijul Islam", "Nurul Hasan", "Shamim Hossain", "Ebadot Hossain", "Mrittunjoy Chowdhury", "Rony Talukdar", "Parvez Hossain Emon"],
    'Afghanistan': ["Rashid Khan", "Rahmanullah Gurbaz", "Mohammad Nabi", "Mujeeb Ur Rahman", "Fazalhaq Farooqi", "Ibrahim Zadran", "Naveen-ul-Haq", "Hashmatullah Shahidi", "Najibullah Zadran", "Azmatullah Omarzai", "Noor Ahmad", "Gulbadin Naib", "Rahmat Shah", "Fareed Ahmad", "Karim Janat", "Hazratullah Zazai", "Qais Ahmad", "Mohammad Saleem", "Wafadar Momand", "Ikram Alikhil", "Riaz Hassan", "Sharafuddin Ashraf", "Darwish Rasooli", "Sediqullah Atal", "Zahir Khan"]
}

players = []
squads = []
import uuid

for team in teams:
    team_name = team[0]
    country = team[1]
    
    names = players_names[country]
    for i, name in enumerate(names):
        pid = "P" + str(uuid.uuid4())[:8].upper()
        
        role = "Batsman"
        if i > 15: role = "Bowler"
        elif i > 10: role = "AllRounder"
        elif i == 0: role = "WicketKeeper"
        
        players.append((pid, name, '1995-01-01', country, 'Right-Hand', 'Right-arm Medium', role))
        squads.append((team_name, pid))

with open('seed_data.py', 'w') as f:
    f.write("teams = [\n")
    for t in teams:
        f.write(f"    {t},\n")
    f.write("]\n\nplayers = [\n")
    for p in players:
        f.write(f"    {p},\n")
    f.write("]\n\nsquads = [\n")
    for s in squads:
        f.write(f"    {s},\n")
    f.write("]\n")

print("Generated seed_data.py")
