/* ============================================================
   2026 FIFA World Cup Prediction Game - app.js
   Data fetched from openfootball/worldcup.json
   ============================================================ */

const DATA_SRC = 'https://raw.githubusercontent.com/openfootball/worldcup.json/refs/heads/master/2026';
// EDITA ESTAS 3 COSAS POR FAVOR
// POR FAVOR
const LEADERBOARD_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSDbPhOej3DnN_bdvrCQ5R0T6HZg6bBaxKdH17J_Pc3oGOkKkd9V83BUDYlBSCevOrqYK2XQuA7ZMCx/pub?gid=1633860364&single=true&output=csv'
const FORM_ID = '1FAIpQLSdiF0qsK65DcaadNKRzDbue8xtkzAIIev-7yqUqAH3srhEAQg';
const ENTRY_ID = 'entry.496944209';
// REPITO, POR FAVOR

// Puedes cambiar los valores por tus propias puntuaciones si quieres
const puntuaciones = {
  grupos: {
    partido: {
      resultadoExacto: 2,
      ganadorEmpateCorrecto: 1
    },
    posicion: {
      primero: 3,
      segundo: 2,
      tercero: 1
    }
  },
  eliminatorias: {
    round32: 2,
    round16: 3,
    quarterfinals: 5,
    semifinals: 10,
    finalist: 20,
    champion: 20,
    thirdPlace: 15
  },
  premios: {
    goldenBoot: [15, 10, 5],
    goldenBall: [15, 10, 5]
  }
};

const FLAG_CODE = {
  'Mexico':'mx','South Africa':'za','South Korea':'kr','Czech Republic':'cz',
  'Canada':'ca','Bosnia & Herzegovina':'ba','Qatar':'qa','Switzerland':'ch',
  'Brazil':'br','Morocco':'ma','Haiti':'ht','Scotland':'gb-sct',
  'USA':'us','Paraguay':'py','Australia':'au','Turkey':'tr',
  'Germany':'de','Cura\u00e7ao':'cw','Ivory Coast':'ci','Ecuador':'ec',
  'Netherlands':'nl','Japan':'jp','Sweden':'se','Tunisia':'tn',
  'Belgium':'be','Egypt':'eg','Iran':'ir','New Zealand':'nz',
  'Spain':'es','Cape Verde':'cv','Saudi Arabia':'sa','Uruguay':'uy',
  'France':'fr','Senegal':'sn','Iraq':'iq','Norway':'no',
  'Argentina':'ar','Algeria':'dz','Austria':'at','Jordan':'jo',
  'Portugal':'pt','DR Congo':'cd','Uzbekistan':'uz','Colombia':'co',
  'England':'gb-eng','Croatia':'hr','Ghana':'gh','Panama':'pa'
};

const AWARD_PLAYERS = [

  // France
  { name: 'Mike Maignan', country: 'France' },
  { name: 'Robin Risser', country: 'France' },
  { name: 'Brice Samba', country: 'France' },
  { name: 'Lucas Digne', country: 'France' },
  { name: 'Malo Gusto', country: 'France' },
  { name: 'Lucas Hernández', country: 'France' },
  { name: 'Theo Hernández', country: 'France' },
  { name: 'Ibrahima Konaté', country: 'France' },
  { name: 'Jules Koundé', country: 'France' },
  { name: 'Maxence Lacroix', country: 'France' },
  { name: 'William Saliba', country: 'France' },
  { name: 'Dayot Upamecano', country: 'France' },
  { name: 'N\'Golo Kanté', country: 'France' },
  { name: 'Manu Koné', country: 'France' },
  { name: 'Adrien Rabiot', country: 'France' },
  { name: 'Aurélien Tchouaméni', country: 'France' },
  { name: 'Warren Zaïre-Emery', country: 'France' },
  { name: 'Maghnes Akliouche', country: 'France' },
  { name: 'Bradley Barcola', country: 'France' },
  { name: 'Rayan Cherki', country: 'France' },
  { name: 'Ousmane Dembélé', country: 'France' },
  { name: 'Désiré Doué', country: 'France' },
  { name: 'Jean-Philippe Mateta', country: 'France' },
  { name: 'Kylian Mbappé', country: 'France' },
  { name: 'Michael Olise', country: 'France' },
  { name: 'Marcus Thuram', country: 'France' },

  // England
  { name: 'Jordan Pickford', country: 'England' },
  { name: 'Ezri Konsa', country: 'England' },
  { name: 'Nico O\'Reilly', country: 'England' },
  { name: 'Declan Rice', country: 'England' },
  { name: 'John Stones', country: 'England' },
  { name: 'Marc Guéhi', country: 'England' },
  { name: 'Bukayo Saka', country: 'England' },
  { name: 'Elliot Anderson', country: 'England' },
  { name: 'Harry Kane', country: 'England' },
  { name: 'Jude Bellingham', country: 'England' },
  { name: 'Marcus Rashford', country: 'England' },
  { name: 'Tino Livramento', country: 'England' },
  { name: 'Dean Henderson', country: 'England' },
  { name: 'Jordan Henderson', country: 'England' },
  { name: 'Dan Burn', country: 'England' },
  { name: 'Kobbie Mainoo', country: 'England' },
  { name: 'Morgan Rogers', country: 'England' },
  { name: 'Anthony Gordon', country: 'England' },
  { name: 'Ollie Watkins', country: 'England' },
  { name: 'Noni Madueke', country: 'England' },
  { name: 'Eberechi Eze', country: 'England' },
  { name: 'Ivan Toney', country: 'England' },
  { name: 'James Trafford', country: 'England' },
  { name: 'Reece James', country: 'England' },
  { name: 'Djed Spence', country: 'England' },
  { name: 'Jarell Quansah', country: 'England' },

  // Brazil
  { name: 'Alisson', country: 'Brazil' },
  { name: 'Ederson Moraes', country: 'Brazil' },
  { name: 'Weverton', country: 'Brazil' },
  { name: 'Alex Sandro', country: 'Brazil' },
  { name: 'Bremer', country: 'Brazil' },
  { name: 'Danilo', country: 'Brazil' },
  { name: 'Douglas Santos', country: 'Brazil' },
  { name: 'Gabriel Magalhães', country: 'Brazil' },
  { name: 'Ibañez', country: 'Brazil' },
  { name: 'Léo Pereira', country: 'Brazil' },
  { name: 'Marquinhos', country: 'Brazil' },
  { name: 'Bruno Guimarães', country: 'Brazil' },
  { name: 'Casemiro', country: 'Brazil' },
  { name: 'Danilo Santos', country: 'Brazil' },
  { name: 'Fabinho', country: 'Brazil' },
  { name: 'Lucas Paquetá', country: 'Brazil' },
  { name: 'Ederson', country: 'Brazil' },
  { name: 'Endrick', country: 'Brazil' },
  { name: 'Gabriel Martinelli', country: 'Brazil' },
  { name: 'Igor Thiago', country: 'Brazil' },
  { name: 'Luiz Henrique', country: 'Brazil' },
  { name: 'Matheus Cunha', country: 'Brazil' },
  { name: 'Neymar Junior', country: 'Brazil' },
  { name: 'Raphinha', country: 'Brazil' },
  { name: 'Rayan', country: 'Brazil' },
  { name: 'Vinícius Júnior', country: 'Brazil' },

  // Spain
  { name: 'Unai Simón', country: 'Spain' },
  { name: 'David Raya', country: 'Spain' },
  { name: 'Joan García', country: 'Spain' },
  { name: 'Pedro Porro', country: 'Spain' },
  { name: 'Marcos Llorente', country: 'Spain' },
  { name: 'Aymeric Laporte', country: 'Spain' },
  { name: 'Pau Cubarsí', country: 'Spain' },
  { name: 'Marc Pubill', country: 'Spain' },
  { name: 'Eric García', country: 'Spain' },
  { name: 'Marc Cucurella', country: 'Spain' },
  { name: 'Alejandro Grimaldo', country: 'Spain' },
  { name: 'Rodri', country: 'Spain' },
  { name: 'Martín Zubimendi', country: 'Spain' },
  { name: 'Pedri', country: 'Spain' },
  { name: 'Fabián Ruiz', country: 'Spain' },
  { name: 'Mikel Merino', country: 'Spain' },
  { name: 'Gavi', country: 'Spain' },
  { name: 'Álex Baena', country: 'Spain' },
  { name: 'Mikel Oyarzabal', country: 'Spain' },
  { name: 'Lamine Yamal', country: 'Spain' },
  { name: 'Ferran Torres', country: 'Spain' },
  { name: 'Borja Iglesias', country: 'Spain' },
  { name: 'Dani Olmo', country: 'Spain' },
  { name: 'Víctor Muñoz', country: 'Spain' },
  { name: 'Nico Williams', country: 'Spain' },
  { name: 'Yéremy Pino', country: 'Spain' },

  // Argentina
  { name: 'Emiliano Martínez', country: 'Argentina' },
  { name: 'Gerónimo Rulli', country: 'Argentina' },
  { name: 'Juan Musso', country: 'Argentina' },
  { name: 'Gonzalo Montiel', country: 'Argentina' },
  { name: 'Nahuel Molina', country: 'Argentina' },
  { name: 'Lisandro Martínez', country: 'Argentina' },
  { name: 'Nicolás Otamendi', country: 'Argentina' },
  { name: 'Leonardo Balerdi', country: 'Argentina' },
  { name: 'Cristian Romero', country: 'Argentina' },
  { name: 'Facundo Medina', country: 'Argentina' },
  { name: 'Nicolás Tagliafico', country: 'Argentina' },
  { name: 'Leandro Paredes', country: 'Argentina' },
  { name: 'Rodrigo De Paul', country: 'Argentina' },
  { name: 'Exequiel Palacios', country: 'Argentina' },
  { name: 'Enzo Fernández', country: 'Argentina' },
  { name: 'Alexis Mac Allister', country: 'Argentina' },
  { name: 'Giovani Lo Celso', country: 'Argentina' },
  { name: 'Valentín Barco', country: 'Argentina' },
  { name: 'Lionel Messi', country: 'Argentina' },
  { name: 'Nico Paz', country: 'Argentina' },
  { name: 'Thiago Almada', country: 'Argentina' },
  { name: 'Nicolás González', country: 'Argentina' },
  { name: 'Giuliano Simeone', country: 'Argentina' },
  { name: 'Lautaro Martínez', country: 'Argentina' },
  { name: 'José Manuel López', country: 'Argentina' },
  { name: 'Julián Álvarez', country: 'Argentina' },

  // Germany
  { name: 'Oliver Baumann', country: 'Germany' },
  { name: 'Manuel Neuer', country: 'Germany' },
  { name: 'Alexander Nübel', country: 'Germany' },
  { name: 'Nadiem Amiri', country: 'Germany' },
  { name: 'Waldemar Anton', country: 'Germany' },
  { name: 'Maximilian Beier', country: 'Germany' },
  { name: 'Nathaniel Brown', country: 'Germany' },
  { name: 'Leon Goretzka', country: 'Germany' },
  { name: 'Pascal Groß', country: 'Germany' },
  { name: 'Kai Havertz', country: 'Germany' },
  { name: 'Lennart Karl', country: 'Germany' },
  { name: 'Joshua Kimmich', country: 'Germany' },
  { name: 'Jamie Leweling', country: 'Germany' },
  { name: 'Jamal Musiala', country: 'Germany' },
  { name: 'Felix Nmecha', country: 'Germany' },
  { name: 'Aleksandar Pavlović', country: 'Germany' },
  { name: 'David Raum', country: 'Germany' },
  { name: 'Antonio Rüdiger', country: 'Germany' },
  { name: 'Leroy Sané', country: 'Germany' },
  { name: 'Nico Schlotterbeck', country: 'Germany' },
  { name: 'Angelo Stiller', country: 'Germany' },
  { name: 'Jonathan Tah', country: 'Germany' },
  { name: 'Malick Thiaw', country: 'Germany' },
  { name: 'Deniz Undav', country: 'Germany' },
  { name: 'Florian Wirtz', country: 'Germany' },
  { name: 'Nick Woltemade', country: 'Germany' },

  // Portugal
  { name: 'Diogo Costa', country: 'Portugal' },
  { name: 'José Sá', country: 'Portugal' },
  { name: 'Rui Silva', country: 'Portugal' },
  { name: 'Ricardo Velho', country: 'Portugal' },
  { name: 'Tomás Araújo', country: 'Portugal' },
  { name: 'João Cancelo', country: 'Portugal' },
  { name: 'Diogo Dalot', country: 'Portugal' },
  { name: 'Rúben Dias', country: 'Portugal' },
  { name: 'Gonçalo Inácio', country: 'Portugal' },
  { name: 'Nuno Mendes', country: 'Portugal' },
  { name: 'Matheus Nunes', country: 'Portugal' },
  { name: 'Nélson Semedo', country: 'Portugal' },
  { name: 'Renato Veiga', country: 'Portugal' },
  { name: 'Samuel Costa', country: 'Portugal' },
  { name: 'Bruno Fernandes', country: 'Portugal' },
  { name: 'João Neves', country: 'Portugal' },
  { name: 'Rúben Neves', country: 'Portugal' },
  { name: 'Bernardo Silva', country: 'Portugal' },
  { name: 'Vitinha', country: 'Portugal' },
  { name: 'Francisco Conceição', country: 'Portugal' },
  { name: 'João Félix', country: 'Portugal' },
  { name: 'Gonçalo Guedes', country: 'Portugal' },
  { name: 'Rafael Leão', country: 'Portugal' },
  { name: 'Pedro Neto', country: 'Portugal' },
  { name: 'Gonçalo Ramos', country: 'Portugal' },
  { name: 'Cristiano Ronaldo', country: 'Portugal' },
  { name: 'Francisco Trincão', country: 'Portugal' },

  // Netherlands
  { name: 'Mark Flekken', country: 'Netherlands' },
  { name: 'Robin Roefs', country: 'Netherlands' },
  { name: 'Bart Verbruggen', country: 'Netherlands' },
  { name: 'Nathan Aké', country: 'Netherlands' },
  { name: 'Denzel Dumfries', country: 'Netherlands' },
  { name: 'Jorrel Hato', country: 'Netherlands' },
  { name: 'Jurriën Timber', country: 'Netherlands' },
  { name: 'Jan Paul van Hecke', country: 'Netherlands' },
  { name: 'Virgil van Dijk', country: 'Netherlands' },
  { name: 'Micky van de Ven', country: 'Netherlands' },
  { name: 'Frenkie de Jong', country: 'Netherlands' },
  { name: 'Marten de Roon', country: 'Netherlands' },
  { name: 'Ryan Gravenberch', country: 'Netherlands' },
  { name: 'Teun Koopmeiners', country: 'Netherlands' },
  { name: 'Tijjani Reijnders', country: 'Netherlands' },
  { name: 'Guus Til', country: 'Netherlands' },
  { name: 'Quinten Timber', country: 'Netherlands' },
  { name: 'Mats Wieffer', country: 'Netherlands' },
  { name: 'Brian Brobbey', country: 'Netherlands' },
  { name: 'Memphis Depay', country: 'Netherlands' },
  { name: 'Cody Gakpo', country: 'Netherlands' },
  { name: 'Justin Kluivert', country: 'Netherlands' },
  { name: 'Noa Lang', country: 'Netherlands' },
  { name: 'Donyell Malen', country: 'Netherlands' },
  { name: 'Crysencio Summerville', country: 'Netherlands' },
  { name: 'Wout Weghorst', country: 'Netherlands' },

  // Belgium
  { name: 'Thibaut Courtois', country: 'Belgium' },
  { name: 'Senne Lammens', country: 'Belgium' },
  { name: 'Mike Penders', country: 'Belgium' },
  { name: 'Timothy Castagne', country: 'Belgium' },
  { name: 'Zeno Debast', country: 'Belgium' },
  { name: 'Maxim De Cuyper', country: 'Belgium' },
  { name: 'Koni De Winter', country: 'Belgium' },
  { name: 'Brandon Mechele', country: 'Belgium' },
  { name: 'Thomas Meunier', country: 'Belgium' },
  { name: 'Nathan Ngoy', country: 'Belgium' },
  { name: 'Joaquin Seys', country: 'Belgium' },
  { name: 'Arthur Theate', country: 'Belgium' },
  { name: 'Kevin De Bruyne', country: 'Belgium' },
  { name: 'Amadou Onana', country: 'Belgium' },
  { name: 'Nicolas Raskin', country: 'Belgium' },
  { name: 'Youri Tielemans', country: 'Belgium' },
  { name: 'Hans Vanaken', country: 'Belgium' },
  { name: 'Axel Witsel', country: 'Belgium' },
  { name: 'Charles De Ketelaere', country: 'Belgium' },
  { name: 'Jérémy Doku', country: 'Belgium' },
  { name: 'Matias Fernandez-Pardo', country: 'Belgium' },
  { name: 'Romelu Lukaku', country: 'Belgium' },
  { name: 'Dodi Lukebakio', country: 'Belgium' },
  { name: 'Diego Moreira', country: 'Belgium' },
  { name: 'Alexis Saelemaekers', country: 'Belgium' },
  { name: 'Leandro Trossard', country: 'Belgium' },

  // Uruguay
  { name: 'Santiago Mele', country: 'Uruguay' },
  { name: 'Fernando Muslera', country: 'Uruguay' },
  { name: 'Sergio Rochet', country: 'Uruguay' },
  { name: 'Ronald Araújo', country: 'Uruguay' },
  { name: 'Santiago Bueno', country: 'Uruguay' },
  { name: 'Sebastián Cáceres', country: 'Uruguay' },
  { name: 'José María Giménez', country: 'Uruguay' },
  { name: 'Mathías Olivera', country: 'Uruguay' },
  { name: 'Joaquín Piquerez', country: 'Uruguay' },
  { name: 'Guillermo Varela', country: 'Uruguay' },
  { name: 'Matías Viña', country: 'Uruguay' },
  { name: 'Maximiliano Araújo', country: 'Uruguay' },
  { name: 'Giorgian de Arrascaeta', country: 'Uruguay' },
  { name: 'Rodrigo Bentancur', country: 'Uruguay' },
  { name: 'Agustín Canobbio', country: 'Uruguay' },
  { name: 'Nicolás de la Cruz', country: 'Uruguay' },
  { name: 'Emiliano Martínez', country: 'Uruguay' },
  { name: 'Facundo Pellistri', country: 'Uruguay' },
  { name: 'Brian Rodríguez', country: 'Uruguay' },
  { name: 'Juan Manuel Sanabria', country: 'Uruguay' },
  { name: 'Manuel Ugarte', country: 'Uruguay' },
  { name: 'Federico Valverde', country: 'Uruguay' },
  { name: 'Rodrigo Zalazar', country: 'Uruguay' },
  { name: 'Rodrigo Aguirre', country: 'Uruguay' },
  { name: 'Federico Viñas', country: 'Uruguay' },
  { name: 'Darwin Núñez', country: 'Uruguay' },

  // Croatia
  { name: 'Dominik Livaković', country: 'Croatia' },
  { name: 'Dominik Kotarski', country: 'Croatia' },
  { name: 'Ivor Pandur', country: 'Croatia' },
  { name: 'Joško Gvardiol', country: 'Croatia' },
  { name: 'Duje Ćaleta-Car', country: 'Croatia' },
  { name: 'Josip Šutalo', country: 'Croatia' },
  { name: 'Josip Stanišić', country: 'Croatia' },
  { name: 'Marin Pongračić', country: 'Croatia' },
  { name: 'Martin Erlić', country: 'Croatia' },
  { name: 'Luka Vušković', country: 'Croatia' },
  { name: 'Luka Modrić', country: 'Croatia' },
  { name: 'Mateo Kovačić', country: 'Croatia' },
  { name: 'Mario Pašalić', country: 'Croatia' },
  { name: 'Nikola Vlašić', country: 'Croatia' },
  { name: 'Luka Sučić', country: 'Croatia' },
  { name: 'Martin Baturina', country: 'Croatia' },
  { name: 'Kristijan Jakić', country: 'Croatia' },
  { name: 'Petar Sučić', country: 'Croatia' },
  { name: 'Nikola Moro', country: 'Croatia' },
  { name: 'Toni Fruk', country: 'Croatia' },
  { name: 'Ivan Perišić', country: 'Croatia' },
  { name: 'Andrej Kramarić', country: 'Croatia' },
  { name: 'Ante Budimir', country: 'Croatia' },
  { name: 'Marco Pašalić', country: 'Croatia' },
  { name: 'Petar Musa', country: 'Croatia' },
  { name: 'Igor Matanović', country: 'Croatia' },

  // Mexico
  { name: 'Raúl Rangel', country: 'Mexico' },
  { name: 'Guillermo Ochoa', country: 'Mexico' },
  { name: 'Carlos Acevedo', country: 'Mexico' },
  { name: 'Johan Vásquez', country: 'Mexico' },
  { name: 'César Montes', country: 'Mexico' },
  { name: 'Israel Reyes', country: 'Mexico' },
  { name: 'Jesús Gallardo', country: 'Mexico' },
  { name: 'Mateo Chávez', country: 'Mexico' },
  { name: 'Jorge Sánchez', country: 'Mexico' },
  { name: 'Edson Álvarez', country: 'Mexico' },
  { name: 'Gilberto Mora', country: 'Mexico' },
  { name: 'Brian Gutiérrez', country: 'Mexico' },
  { name: 'Luis Romo', country: 'Mexico' },
  { name: 'Orbelín Pineda', country: 'Mexico' },
  { name: 'Álvaro Fidalgo', country: 'Mexico' },
  { name: 'Erik Lira', country: 'Mexico' },
  { name: 'Luis Chávez', country: 'Mexico' },
  { name: 'Obed Vargas', country: 'Mexico' },
  { name: 'Raúl Jiménez', country: 'Mexico' },
  { name: 'Guillermo Martínez', country: 'Mexico' },
  { name: 'Santiago Giménez', country: 'Mexico' },
  { name: 'Armando González', country: 'Mexico' },
  { name: 'Julián Quiñones', country: 'Mexico' },
  { name: 'Alexis Vega', country: 'Mexico' },
  { name: 'César Huerta', country: 'Mexico' },
  { name: 'Roberto Alvarado', country: 'Mexico' },

  // Colombia
  { name: 'Álvaro Montero', country: 'Colombia' },
  { name: 'Camilo Vargas', country: 'Colombia' },
  { name: 'David Ospina', country: 'Colombia' },
  { name: 'Daniel Muñoz', country: 'Colombia' },
  { name: 'Santiago Arias', country: 'Colombia' },
  { name: 'Dávinson Sánchez', country: 'Colombia' },
  { name: 'Jhon Lucumí', country: 'Colombia' },
  { name: 'Yerry Mina', country: 'Colombia' },
  { name: 'Willer Ditta', country: 'Colombia' },
  { name: 'Déiver Machado', country: 'Colombia' },
  { name: 'Johan Mojica', country: 'Colombia' },
  { name: 'Gustavo Puerta', country: 'Colombia' },
  { name: 'James Rodríguez', country: 'Colombia' },
  { name: 'Jefferson Lerma', country: 'Colombia' },
  { name: 'Jhon Arias', country: 'Colombia' },
  { name: 'Jorge Carrascal', country: 'Colombia' },
  { name: 'Juan Fernando Quintero', country: 'Colombia' },
  { name: 'Richard Ríos', country: 'Colombia' },
  { name: 'Kevin Castaño', country: 'Colombia' },
  { name: 'Jaminton Campaz', country: 'Colombia' },
  { name: 'Juan Portilla', country: 'Colombia' },
  { name: 'Luis Díaz', country: 'Colombia' },
  { name: 'Luis Suárez', country: 'Colombia' },
  { name: 'Jhon Córdoba', country: 'Colombia' },
  { name: 'Carlos Gómez', country: 'Colombia' },
  { name: 'Juan Camilo Hernández', country: 'Colombia' },

  // USA
  { name: 'Matt Turner', country: 'USA' },
  { name: 'Sergiño Dest', country: 'USA' },
  { name: 'Chris Richards', country: 'USA' },
  { name: 'Tyler Adams', country: 'USA' },
  { name: 'Antonee Robinson', country: 'USA' },
  { name: 'Auston Trusty', country: 'USA' },
  { name: 'Gio Reyna', country: 'USA' },
  { name: 'Weston McKennie', country: 'USA' },
  { name: 'Ricardo Pepi', country: 'USA' },
  { name: 'Christian Pulisic', country: 'USA' },
  { name: 'Brenden Aaronson', country: 'USA' },
  { name: 'Miles Robinson', country: 'USA' },
  { name: 'Tim Ream', country: 'USA' },
  { name: 'Sebastian Berhalter', country: 'USA' },
  { name: 'Cristian Roldan', country: 'USA' },
  { name: 'Alex Freeman', country: 'USA' },
  { name: 'Malik Tillman', country: 'USA' },
  { name: 'Max Arfsten', country: 'USA' },
  { name: 'Haji Wright', country: 'USA' },
  { name: 'Folarin Balogun', country: 'USA' },
  { name: 'Timothy Weah', country: 'USA' },
  { name: 'Mark McKenzie', country: 'USA' },
  { name: 'Joe Scally', country: 'USA' },
  { name: 'Matt Freese', country: 'USA' },
  { name: 'Chris Brady', country: 'USA' },
  { name: 'Alejandro Zendejas', country: 'USA' },

  // Morocco
  { name: 'Yassine Bounou', country: 'Morocco' },
  { name: 'Munir El Kajoui', country: 'Morocco' },
  { name: 'Reda Tagnaouti', country: 'Morocco' },
  { name: 'Noussair Mazraoui', country: 'Morocco' },
  { name: 'Anass Salah-Eddine', country: 'Morocco' },
  { name: 'Youssef Belammari', country: 'Morocco' },
  { name: 'Achraf Hakimi', country: 'Morocco' },
  { name: 'Zakaria El Ouahdi', country: 'Morocco' },
  { name: 'Nayef Aguerd', country: 'Morocco' },
  { name: 'Chadi Riad', country: 'Morocco' },
  { name: 'Redouane Halhal', country: 'Morocco' },
  { name: 'Issa Diop', country: 'Morocco' },
  { name: 'Samir El Mourabet', country: 'Morocco' },
  { name: 'Ayyoub Bouaddi', country: 'Morocco' },
  { name: 'Neil El Aynaoui', country: 'Morocco' },
  { name: 'Sofyan Amrabat', country: 'Morocco' },
  { name: 'Azzedine Ounahi', country: 'Morocco' },
  { name: 'Bilal El Khannouss', country: 'Morocco' },
  { name: 'Ismael Saibari', country: 'Morocco' },
  { name: 'Abde Ezzalzouli', country: 'Morocco' },
  { name: 'Chemsdine Talbi', country: 'Morocco' },
  { name: 'Soufiane Rahimi', country: 'Morocco' },
  { name: 'Ayoub El Kaabi', country: 'Morocco' },
  { name: 'Brahim Díaz', country: 'Morocco' },
  { name: 'Gessime Yassine', country: 'Morocco' },
  { name: 'Ayoube Amaimouni', country: 'Morocco' }
];

function getFlagClass(team) {
  if (!team) return '';
  const code = FLAG_CODE[team];
  return code ? 'fi fi-'+code : '';
}

let TEAMS_BY_GROUP = {};       // {A: [{name,flag,fifa},...], B: [...]}
let GROUP_NAMES = [];
let GROUP_MATCHES_BY_GROUP = {};  // group -> official scheduled matches, sorted by kickoff
let BRACKET_R32 = [];          // [{num,slot1:{type,group,groups?},slot2:{type,...}},...]
let KO_TREE = null;            // built bracket tree for rendering
let LOADED = false;
let tpAllocation = {};         // matchNum -> third-place team name (from FIFA table)

// FIFA ranking fallback for best-third tiebreakers.
// Lower number = better ranking. Update this list whenever you want to mirror a newer
// FIFA/Coca-Cola Men's World Ranking edition. Unknown teams fall back to 999.
const FIFA_RANKING_TIEBREAK = {
  'Argentina': 1,
  'France': 2,
  'Spain': 3,
  'England': 4,
  'Brazil': 5,
  'Portugal': 6,
  'Netherlands': 7,
  'Belgium': 8,
  'Germany': 9,
  'Croatia': 10,
  'Morocco': 11,
  'Colombia': 12,
  'Uruguay': 13,
  'Mexico': 14,
  'USA': 15,
  'Senegal': 16,
  'Japan': 17,
  'Switzerland': 18,
  'Iran': 19,
  'South Korea': 20,
  'Austria': 21,
  'Australia': 22,
  'Qatar': 23,
  'Norway': 24,
  'Ecuador': 25,
  'Turkey': 26,
  'Canada': 27,
  'Sweden': 28,
  'Panama': 29,
  'Egypt': 30,
  'Algeria': 31,
  'Tunisia': 32,
  'Paraguay': 33,
  'Ivory Coast': 34,
  'Saudi Arabia': 35,
  'Scotland': 36,
  'Bosnia & Herzegovina': 37,
  'Czech Republic': 38,
  'Iraq': 39,
  'Uzbekistan': 40,
  'Jordan': 41,
  'DR Congo': 42,
  'South Africa': 43,
  'Cape Verde': 44,
  'New Zealand': 45,
  'Haiti': 46,
  'Curaçao': 47
};

function getTeamConductScore(team) {
  // The app does not ask for yellow/red cards, so every team is neutral by default.
  // If you later add cards, store a numeric conduct score here; higher wins.
  return state.teamConduct?.[team] ?? 0;
}

function getTeamFifaRank(team) {
  return FIFA_RANKING_TIEBREAK[team] ?? 999;
}

function compareBestThirds(a, b) {
  return (b.row.pts - a.row.pts) ||
    (b.row.gd - a.row.gd) ||
    (b.row.gf - a.row.gf) ||
    (getTeamConductScore(b.row.team) - getTeamConductScore(a.row.team)) ||
    (getTeamFifaRank(a.row.team) - getTeamFifaRank(b.row.team)) ||
    a.group.localeCompare(b.group);
}

function getAutoThirdPlaceTeams() {
  return GROUP_NAMES
    .filter(group => isGroupComplete(group))
    .map(group => ({ group, row: calculateGroupStandings(group)[2] }))
    .filter(item => item.row)
    .sort(compareBestThirds)
    .slice(0, 8);
}

function syncAutoThirdPlace() {
  state.thirdPlace = getAutoThirdPlaceTeams().map(item => item.row.team);
}

function buildTPAllocation() {
  tpAllocation = {};
  syncAutoThirdPlace();

  const qualifiedThirds = getAutoThirdPlaceTeams();
  if (qualifiedThirds.length !== 8) return;

  const byGroup = {};
  qualifiedThirds.forEach(item => {
    byGroup[item.group] = item.row.team;
  });

  const groups = Object.keys(byGroup).sort();
  const key = groups.join("");
  const order = TP_TABLE[key];

  if (!order) {
    console.warn("No TP_TABLE mapping found for:", key, groups);
    return;
  }

  TP_COLUMNS.forEach((matchNum, index) => {
    const group = String(order[index]).replace(/^3/, "");
    tpAllocation[matchNum] = byGroup[group] || null;
  });
}

// ---- State ----
let state = {
  groups: {},
  groupMatches: {},       // group -> { "Team A__Team B": {home, away} }
  thirdPlace: [],
  matchTeams: {},         // matchId -> { team1, team2 }
  knockoutResults: {},    // matchId -> winner team name
  awards: { goldenBoot: ['','',''], goldenBall: ['','',''] }
};

const LOCAL_STORAGE_VERSION = '5';
const LOCAL_STORAGE_VERSION_KEY = 'wc2026_version';
const LOCAL_STORAGE_PICKS_KEY = 'wc2026_picks';
let localSaveTimer = null;

function normalizeLoadedState() {
  ensureAllGroupMatches();
  updateAllGroupOrdersFromMatches();
  buildTPAllocation();
  computeMatchTeams();
}

function saveLocalPredictionNow() {
  try {
    const payload = buildPayload();
    payload._localDraftSavedAt = new Date().toISOString();
    localStorage.setItem(LOCAL_STORAGE_PICKS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Could not save local prediction draft:', e);
  }
}

function saveLocalPredictionSoon() {
  clearTimeout(localSaveTimer);
  localSaveTimer = setTimeout(saveLocalPredictionNow, 250);
}

function clearLocalPrediction() {
  clearTimeout(localSaveTimer);
  try { localStorage.removeItem(LOCAL_STORAGE_PICKS_KEY); } catch (e) {}
}

function restoreLocalPrediction() {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_PICKS_KEY);
    if (!saved) return false;

    const data = JSON.parse(saved);

    if (data.groupMatches) {
      state.groupMatches = data.groupMatches;
      ensureAllGroupMatches();
      updateAllGroupOrdersFromMatches();
    }

    if (data.groups) {
      GROUP_NAMES.forEach(g => {
        if (Array.isArray(data.groups[g]) && data.groups[g].length) {
          state.groups[g] = data.groups[g].slice();
        }
      });
    }

    if (data.knockout?.matches) {
      Object.values(data.knockout.matches).flat().forEach(match => {
        if (match?.match && match?.winner) {
          state.knockoutResults[match.match] = match.winner;
        }
      });
    } else if (data.knockout) {
      ['round32','round16','quarterfinals','semifinals'].forEach(round => {
        const treeArr = KO_TREE[round] || [];
        (data.knockout[round] || []).forEach((team, index) => {
          if (treeArr[index] && team) state.knockoutResults[treeArr[index].num] = team;
        });
      });
      if (data.knockout.final && KO_TREE.final?.[0]) state.knockoutResults[KO_TREE.final[0].num] = data.knockout.final;
      if (data.knockout.thirdPlace && KO_TREE.thirdPlace?.[0]) state.knockoutResults[KO_TREE.thirdPlace[0].num] = data.knockout.thirdPlace;
    }

    if (data.awards) {
      state.awards = {
        goldenBoot: data.awards.goldenBoot || ['', '', ''],
        goldenBall: data.awards.goldenBall || ['', '', '']
      };
    }

    normalizeLoadedState();
    return true;
  } catch (e) {
    console.warn('Could not restore local prediction draft:', e);
    clearLocalPrediction();
    return false;
  }
}

function closeAwardDropdowns() {
  // Legacy no-op kept because older dropdown code called this from global listeners.
  // Awards now use the popup picker.
}

// ---- Fetch & Parse ----
async function loadData() {
  try {
    const resp = await fetch(DATA_SRC+'/worldcup.json');
    const data = await resp.json();

    // Extract group compositions from group-stage matches (early exit at 4 teams/group)
    TEAMS_BY_GROUP = {};
    const seen = {}, done = {};
    data.matches.forEach(m => {
      const g = m.group;
      if (!g || !g.startsWith('Group ')) return;
      const letter = g.replace('Group ','');
      if (done[letter]) return;
      if (!TEAMS_BY_GROUP[letter]) TEAMS_BY_GROUP[letter] = [];
      if (!seen[letter]) seen[letter] = {};
      [m.team1, m.team2].forEach(t => {
        if (t && !seen[letter][t]) {
          seen[letter][t] = true;
          TEAMS_BY_GROUP[letter].push({ name: t, flag: '', fifa: '' });
        }
      });
      if (TEAMS_BY_GROUP[letter].length >= 4) done[letter] = true;
    });
    GROUP_NAMES = Object.keys(TEAMS_BY_GROUP).sort();

    // Official group-stage schedule from DATA_SRC, used for displaying matchdays in order
    GROUP_MATCHES_BY_GROUP = {};
    data.matches
      .filter(m => m.group && m.group.startsWith('Group '))
      .forEach((m, index) => {
        const letter = m.group.replace('Group ', '');
        if (!GROUP_MATCHES_BY_GROUP[letter]) GROUP_MATCHES_BY_GROUP[letter] = [];
        GROUP_MATCHES_BY_GROUP[letter].push({
          team1: m.team1,
          team2: m.team2,
          date: m.date || '',
          time: m.time || '',
          round: m.round || '',
          ground: m.ground || '',
          originalIndex: index,
          key: groupMatchKey(m.team1, m.team2)
        });
      });

    Object.keys(GROUP_MATCHES_BY_GROUP).forEach(group => {
      GROUP_MATCHES_BY_GROUP[group].sort((a, b) => {
        const dateCmp = String(a.date).localeCompare(String(b.date));
        if (dateCmp) return dateCmp;
        const timeCmp = String(a.time).localeCompare(String(b.time));
        if (timeCmp) return timeCmp;
        return a.originalIndex - b.originalIndex;
      });
    });

    // Initialize state groups
    GROUP_NAMES.forEach(g => {
      state.groups[g] = TEAMS_BY_GROUP[g].map(t => t.name);
    });
    ensureAllGroupMatches();

    // Build bracket using official 2026 FIFA structure
    KO_TREE = {
      round32: [
        {num:73,slot1:{type:'runner_up',group:'A'},slot2:{type:'runner_up',group:'B'}},
        {num:74,slot1:{type:'winner',group:'E'},slot2:{type:'third_place',groups:['A','B','C','D','F']}},
        {num:75,slot1:{type:'winner',group:'F'},slot2:{type:'runner_up',group:'C'}},
        {num:76,slot1:{type:'winner',group:'C'},slot2:{type:'runner_up',group:'F'}},
        {num:77,slot1:{type:'winner',group:'I'},slot2:{type:'third_place',groups:['C','D','F','G','H']}},
        {num:78,slot1:{type:'runner_up',group:'E'},slot2:{type:'runner_up',group:'I'}},
        {num:79,slot1:{type:'winner',group:'A'},slot2:{type:'third_place',groups:['C','E','F','H','I']}},
        {num:80,slot1:{type:'winner',group:'L'},slot2:{type:'third_place',groups:['E','H','I','J','K']}},
        {num:81,slot1:{type:'winner',group:'D'},slot2:{type:'third_place',groups:['B','E','F','I','J']}},
        {num:82,slot1:{type:'winner',group:'G'},slot2:{type:'third_place',groups:['A','E','H','I','J']}},
        {num:83,slot1:{type:'runner_up',group:'K'},slot2:{type:'runner_up',group:'L'}},
        {num:84,slot1:{type:'winner',group:'H'},slot2:{type:'runner_up',group:'J'}},
        {num:85,slot1:{type:'winner',group:'B'},slot2:{type:'third_place',groups:['E','F','G','I','J']}},
        {num:86,slot1:{type:'winner',group:'J'},slot2:{type:'runner_up',group:'H'}},
        {num:87,slot1:{type:'winner',group:'K'},slot2:{type:'third_place',groups:['D','E','I','J','L']}},
        {num:88,slot1:{type:'runner_up',group:'D'},slot2:{type:'runner_up',group:'G'}}
      ],
      round16: [
        {num:89,slot1:{type:'winner_of',matchNum:73},slot2:{type:'winner_of',matchNum:75}},
        {num:90,slot1:{type:'winner_of',matchNum:74},slot2:{type:'winner_of',matchNum:77}},
        {num:91,slot1:{type:'winner_of',matchNum:76},slot2:{type:'winner_of',matchNum:78}},
        {num:92,slot1:{type:'winner_of',matchNum:79},slot2:{type:'winner_of',matchNum:80}},
        {num:93,slot1:{type:'winner_of',matchNum:83},slot2:{type:'winner_of',matchNum:84}},
        {num:94,slot1:{type:'winner_of',matchNum:81},slot2:{type:'winner_of',matchNum:82}},
        {num:95,slot1:{type:'winner_of',matchNum:86},slot2:{type:'winner_of',matchNum:88}},
        {num:96,slot1:{type:'winner_of',matchNum:85},slot2:{type:'winner_of',matchNum:87}}
      ],
      quarterfinals: [
        {num:97,slot1:{type:'winner_of',matchNum:89},slot2:{type:'winner_of',matchNum:90}},
        {num:98,slot1:{type:'winner_of',matchNum:93},slot2:{type:'winner_of',matchNum:94}},
        {num:99,slot1:{type:'winner_of',matchNum:91},slot2:{type:'winner_of',matchNum:92}},
        {num:100,slot1:{type:'winner_of',matchNum:95},slot2:{type:'winner_of',matchNum:96}}
      ],
      semifinals: [
        {num:101,slot1:{type:'winner_of',matchNum:97},slot2:{type:'winner_of',matchNum:98}},
        {num:102,slot1:{type:'winner_of',matchNum:99},slot2:{type:'winner_of',matchNum:100}}
      ],
      thirdPlace: [
        {num:103,slot1:{type:'loser_of',matchNum:101},slot2:{type:'loser_of',matchNum:102}}
      ],
      final: [
        {num:104,slot1:{type:'winner_of',matchNum:101},slot2:{type:'winner_of',matchNum:102}}
      ]
    };
    BRACKET_R32 = KO_TREE.round32;
    LOADED = true;
    return true;
  } catch(e) {
    console.error('Failed to load tournament data:', e);
    showToast('Failed to load tournament data. Check your connection.', true);
    return false;
  }
}

function findTeamGroup(teamName) {
  for (const g of GROUP_NAMES) {
    if (state.groups[g] && state.groups[g].includes(teamName)) return g;
  }
  return TEAMS_BY_GROUP ? Object.keys(TEAMS_BY_GROUP).find(g => TEAMS_BY_GROUP[g].some(t=>t.name===teamName)) : null;
}

function getTeamFlagClass(teamName) { return getFlagClass(teamName); }

function groupMatchKey(team1, team2) {
  return [team1, team2].sort().join('__');
}

function getGroupMatchList(group) {
  if (GROUP_MATCHES_BY_GROUP[group] && GROUP_MATCHES_BY_GROUP[group].length) {
    return GROUP_MATCHES_BY_GROUP[group];
  }

  const teams = (TEAMS_BY_GROUP[group] || []).map(t => t.name);
  const matches = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matches.push({ team1: teams[i], team2: teams[j], key: groupMatchKey(teams[i], teams[j]), date: '', time: '', round: '', ground: '' });
    }
  }
  return matches;
}

function formatMatchDate(match) {
  if (!match.date) return '';
  const date = new Date(match.date + 'T00:00:00');
  if (Number.isNaN(date.getTime())) return match.date;
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '').toUpperCase();
}

function getMatchdayNumber(match, fallback) {
  const found = String(match.round || '').match(/\d+/);
  return found ? found[0] : String(fallback + 1);
}

function ensureAllGroupMatches() {
  if (!state.groupMatches) state.groupMatches = {};

  GROUP_NAMES.forEach(group => {
    if (!state.groupMatches[group]) state.groupMatches[group] = {};

    getGroupMatchList(group).forEach(match => {
      if (!state.groupMatches[group][match.key]) {
        state.groupMatches[group][match.key] = { home: null, away: null };
      }
    });
  });
}

function parseGoalValue(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 0 || num > 99) return null;
  return num;
}

function calculateGroupStandings(group) {
  ensureAllGroupMatches();

  const originalTeams = (TEAMS_BY_GROUP[group] || []).map(t => t.name);
  const stats = {};
  const playedMatches = [];

  originalTeams.forEach((team, index) => {
    stats[team] = { team, index, pts: 0, gf: 0, ga: 0, gd: 0, played: 0, wins: 0 };
  });

  getGroupMatchList(group).forEach(match => {
    const result = state.groupMatches[group]?.[match.key] || {};
    const home = parseGoalValue(result.home);
    const away = parseGoalValue(result.away);

    if (home === null || away === null) return;

    const a = stats[match.team1];
    const b = stats[match.team2];
    if (!a || !b) return;

    playedMatches.push({ team1: match.team1, team2: match.team2, home, away });

    a.played += 1;
    b.played += 1;
    a.gf += home;
    a.ga += away;
    b.gf += away;
    b.ga += home;
    a.gd = a.gf - a.ga;
    b.gd = b.gf - b.ga;

    if (home > away) {
      a.pts += 3;
      a.wins += 1;
    } else if (away > home) {
      b.pts += 3;
      b.wins += 1;
    } else {
      a.pts += 1;
      b.pts += 1;
    }
  });

  const overallCompare = (a, b) =>
    (b.gd - a.gd) ||
    (b.gf - a.gf) ||
    (b.wins - a.wins) ||
    (a.index - b.index);

  const getHeadToHeadStats = (teamRows) => {
    const names = new Set(teamRows.map(row => row.team));
    const h2h = {};

    teamRows.forEach(row => {
      h2h[row.team] = { team: row.team, pts: 0, gf: 0, ga: 0, gd: 0 };
    });

    playedMatches.forEach(match => {
      if (!names.has(match.team1) || !names.has(match.team2)) return;

      const a = h2h[match.team1];
      const b = h2h[match.team2];

      a.gf += match.home;
      a.ga += match.away;
      b.gf += match.away;
      b.ga += match.home;
      a.gd = a.gf - a.ga;
      b.gd = b.gf - b.ga;

      if (match.home > match.away) a.pts += 3;
      else if (match.away > match.home) b.pts += 3;
      else {
        a.pts += 1;
        b.pts += 1;
      }
    });

    return h2h;
  };

  const h2hKey = (row, h2h) => {
    const stat = h2h[row.team];
    return `${stat.pts}|${stat.gd}|${stat.gf}`;
  };

  const rankPointTie = (teamRows) => {
    if (teamRows.length <= 1) return teamRows;

    const h2h = getHeadToHeadStats(teamRows);
    const sorted = [...teamRows].sort((a, b) => {
      const ah = h2h[a.team];
      const bh = h2h[b.team];

      return (bh.pts - ah.pts) ||
        (bh.gd - ah.gd) ||
        (bh.gf - ah.gf) ||
        overallCompare(a, b);
    });

    const buckets = [];
    sorted.forEach(row => {
      const key = h2hKey(row, h2h);
      const last = buckets[buckets.length - 1];
      if (last && last.key === key) last.rows.push(row);
      else buckets.push({ key, rows: [row] });
    });

    if (buckets.length === 1) {
      return [...teamRows].sort(overallCompare);
    }

    return buckets.flatMap(bucket =>
      bucket.rows.length === 1 ? bucket.rows : rankPointTie(bucket.rows)
    );
  };

  const byPoints = [...Object.values(stats)].sort((a, b) =>
    (b.pts - a.pts) ||
    overallCompare(a, b)
  );

  const pointBuckets = [];
  byPoints.forEach(row => {
    const last = pointBuckets[pointBuckets.length - 1];
    if (last && last.pts === row.pts) last.rows.push(row);
    else pointBuckets.push({ pts: row.pts, rows: [row] });
  });

  return pointBuckets.flatMap(bucket =>
    bucket.rows.length === 1 ? bucket.rows : rankPointTie(bucket.rows)
  );
}

function updateGroupOrderFromMatches(group) {
  state.groups[group] = calculateGroupStandings(group).map(row => row.team);

  syncAutoThirdPlace();
}

function updateAllGroupOrdersFromMatches() {
  GROUP_NAMES.forEach(updateGroupOrderFromMatches);
}

function isGroupComplete(group) {
  ensureAllGroupMatches();
  return getGroupMatchList(group).every(match => {
    const result = state.groupMatches[group]?.[match.key] || {};
    return parseGoalValue(result.home) !== null && parseGoalValue(result.away) !== null;
  });
}

function openGroupResultsModal(group) {
  ensureAllGroupMatches();

  const modal = document.getElementById('predictionModal');
  const viewer = document.getElementById('predictionViewer');
  modal.style.display = 'flex';

  const teams = (TEAMS_BY_GROUP[group] || []).map(t => t.name);
  const matches = getGroupMatchList(group);

  viewer.innerHTML = `
    <div class="group-results-editor">
      <h3>GRUPO ${group}</h3>
      <div class="group-modal-team-grid"></div>
      <div class="group-modal-divider"></div>
      <h4 class="group-modal-section-title"><span>📅</span> PARTIDOS DEL GRUPO</h4>
      <div class="group-match-list"></div>
      <div class="group-live-standings-wrap">
        <h4 class="group-modal-section-title"><span>🏆</span> CLASIFICACIÓN</h4>
        <div class="group-modal-standings"></div>
      </div>
      <div class="group-modal-info">ⓘ Introduce los resultados de los partidos para ver la clasificación.</div>
      <div class="group-modal-actions">
        <button type="button" class="toolbar-btn" id="cancelGroupResults">Cerrar</button>
        <button type="button" class="submit-btn" id="saveGroupResults">Guardar</button>
      </div>
    </div>
  `;

  const teamGrid = viewer.querySelector('.group-modal-team-grid');
  teams.forEach(team => {
    const box = document.createElement('div');
    box.className = 'group-modal-team-card';
    box.innerHTML = `
      <span class="team-flag ${getTeamFlagClass(team)}"></span>
      <span>${team}</span>
    `;
    teamGrid.appendChild(box);
  });

  const list = viewer.querySelector('.group-match-list');

  matches.forEach((match, index) => {
    const result = state.groupMatches[group][match.key] || { home: null, away: null };
    const row = document.createElement('div');
    row.className = 'group-match-row';
    row.innerHTML = `
      <div class="match-date-badge">
        <strong>${getMatchdayNumber(match, index)}</strong>
        <span>${formatMatchDate(match)}</span>
      </div>
      <div class="match-team match-team-left">
        <span class="team-flag ${getTeamFlagClass(match.team1)}"></span>
        <span>${match.team1}</span>
      </div>
      <div class="match-score-controls">
        <input class="score-input" type="number" min="0" max="99" inputmode="numeric" data-key="${match.key}" data-side="home" value="${result.home ?? 0}">
        <span class="score-separator">-</span>
        <input class="score-input" type="number" min="0" max="99" inputmode="numeric" data-key="${match.key}" data-side="away" value="${result.away ?? 0}">
      </div>
      <div class="match-team match-team-right">
        <span>${match.team2}</span>
        <span class="team-flag ${getTeamFlagClass(match.team2)}"></span>
      </div>
    `;
    list.appendChild(row);
  });

  function redrawStandings() {
    const tmp = JSON.parse(JSON.stringify(state.groupMatches[group] || {}));
    viewer.querySelectorAll('.score-input').forEach(input => {
      if (!tmp[input.dataset.key]) tmp[input.dataset.key] = { home: null, away: null };
      tmp[input.dataset.key][input.dataset.side] = parseGoalValue(input.value);
    });

    const old = state.groupMatches[group];
    state.groupMatches[group] = tmp;
    const freshStandings = calculateGroupStandings(group);
    state.groupMatches[group] = old;

    const standingsDiv = viewer.querySelector('.group-modal-standings');
    standingsDiv.innerHTML = '';

    freshStandings.forEach((row, idx) => {
      const item = document.createElement('div');
      item.className = 'group-team pos-' + (idx + 1) + (idx >= 3 ? ' eliminated' : '');
      item.innerHTML = `
        <span class="position-badge">${idx + 1}</span>
        <span class="team-flag ${getTeamFlagClass(row.team)}"></span>
        <span class="team-name">${row.team}</span>
        <span class="standings-mini">${row.pts} pts · ${row.gf}-${row.ga}</span>
      `;
      standingsDiv.appendChild(item);
    });
  }

  viewer.querySelectorAll('.score-input').forEach(input => input.addEventListener('input', redrawStandings));
  redrawStandings();

  document.getElementById('cancelGroupResults').addEventListener('click', closePredictionModal);
  document.getElementById('saveGroupResults').addEventListener('click', () => {
    buildTPAllocation();
    computeMatchTeams();
    const previousMatchTeams = cloneMatchTeamsSnapshot();

    viewer.querySelectorAll('.score-input').forEach(input => {
      if (!state.groupMatches[group][input.dataset.key]) {
        state.groupMatches[group][input.dataset.key] = { home: null, away: null };
      }
      state.groupMatches[group][input.dataset.key][input.dataset.side] = parseGoalValue(input.value);
    });

    updateGroupOrderFromMatches(group);
    cleanupKnockoutAfterGroupChange(previousMatchTeams);
    closePredictionModal();
    renderAll();
    saveLocalPredictionSoon();
  });
}


// ---- Compute match teams from group picks ----
function getSlotTeam(ref) {
  if (!ref) return null;
  if (ref.type === 'winner') return state.groups[ref.group] ? state.groups[ref.group][0] : null;
  if (ref.type === 'runner_up') return state.groups[ref.group] ? state.groups[ref.group][1] : null;
  if (ref.type === 'third_place') return tpAllocation[ref._matchNum] || null;
  if (ref.type === 'winner_of') return state.knockoutResults[ref.matchNum] || null;
  if (ref.type === 'loser_of') {
    const m = state.matchTeams[ref.matchNum];
    const w = state.knockoutResults[ref.matchNum];
    if (!m || !w) return null;
    return m.team1 === w ? m.team2 : m.team1;
  }
  return null;
}

function computeMatchTeams() {
  state.matchTeams = {};

  // R32: resolve from group picks + TP allocation
  KO_TREE.round32.forEach(m => {
    state.matchTeams[m.num] = {
      team1: getSlotTeam(Object.assign({}, m.slot1, {_matchNum: m.num})),
      team2: getSlotTeam(Object.assign({}, m.slot2, {_matchNum: m.num}))
    };
  });

  // R16: resolve winners
  (KO_TREE.round16 || []).forEach(m => {
    state.matchTeams[m.num] = {
      team1: getSlotTeam(m.slot1),
      team2: getSlotTeam(m.slot2)
    };
  });

  // QF
  (KO_TREE.quarterfinals || []).forEach(m => {
    state.matchTeams[m.num] = {
      team1: getSlotTeam(m.slot1),
      team2: getSlotTeam(m.slot2)
    };
  });

  // SF
  (KO_TREE.semifinals || []).forEach(m => {
    state.matchTeams[m.num] = {
      team1: getSlotTeam(m.slot1),
      team2: getSlotTeam(m.slot2)
    };
  });

  // Final
  if (KO_TREE.final && KO_TREE.final[0]) {
    const m = KO_TREE.final[0];
    state.matchTeams[m.num] = {
      team1: getSlotTeam(m.slot1),
      team2: getSlotTeam(m.slot2)
    };
  }

  // Third place
  if (KO_TREE.thirdPlace && KO_TREE.thirdPlace[0]) {
    const m = KO_TREE.thirdPlace[0];
    state.matchTeams[m.num] = {
      team1: getSlotTeam(m.slot1),
      team2: getSlotTeam(m.slot2)
    };
  }
}



// ---- Toast / Loading / Confetti ----
function showToast(msg, error) {
  const c = document.getElementById('toastContainer');
  const d = document.createElement('div');
  d.className = error ? 'error-toast' : 'success-toast';
  d.textContent = msg;
  c.appendChild(d);
  setTimeout(() => d.remove(), 3500);
}

function showLoading(msg) {
  document.getElementById('loadingOverlay').style.display = 'flex';
  document.getElementById('loadingText').textContent = msg || 'Loading...';
}
function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

function fireConfetti() {
  const colors = ['#FFD700','#FF6B6B','#4CAF50','#64B5F6','#FF8A65','#BA68C8','#FFF176'];
  const c = document.getElementById('confettiContainer');
  for (let i = 0; i < 80; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random()*100+'%';
    p.style.width = (6+Math.random()*10)+'px';
    p.style.height = (6+Math.random()*10)+'px';
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    p.style.animationDuration = (2+Math.random()*3)+'s';
    p.style.animationDelay = Math.random()*0.5+'s';
    c.appendChild(p);
    setTimeout(() => p.remove(), 4000);
  }
}

// ---- Render Group Stage ----
function renderGroups() {
  ensureAllGroupMatches();
  syncAutoThirdPlace();

  const grid = document.getElementById('groupsGrid');
  grid.innerHTML = '';
  const autoThirds = new Set(state.thirdPlace);

  GROUP_NAMES.forEach(g => {
    const complete = isGroupComplete(g);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'group-card group-card-clickable' + (complete ? ' group-complete' : ' group-empty');
    card.title = complete ? 'Editar resultados del grupo ' + g : 'Meter resultados del grupo ' + g;

    const h3 = document.createElement('h3');
    h3.textContent = 'Group ' + g;
    card.appendChild(h3);

    const originalTeams = (TEAMS_BY_GROUP[g] || []).map(t => t.name);

    if (!complete) {
      const empty = document.createElement('div');
      empty.className = 'group-empty-preview';

      const flags = document.createElement('div');
      flags.className = 'group-empty-flags';

      originalTeams.forEach(team => {
        const flagBox = document.createElement('span');
        flagBox.className = 'group-empty-flag-box';
        flagBox.title = team;
        flagBox.innerHTML = '<span class="team-flag ' + getTeamFlagClass(team) + '"></span>';
        flags.appendChild(flagBox);
      });

      empty.appendChild(flags);
      card.appendChild(empty);
    } else {
      const standings = calculateGroupStandings(g);
      standings.forEach((stat, idx) => {
        const team = stat.team;
        const isThird = idx === 2;
        const isFourth = idx === 3;
        const eliminated = isFourth || (isThird && !autoThirds.has(team));

        const row = document.createElement('div');
        row.className =
          'group-team pos-' + (idx + 1) +
          (eliminated ? ' eliminated' : '') +
          (isThird && autoThirds.has(team) ? ' qualified-third' : '');

        const badge = document.createElement('span');
        badge.className = 'position-badge';
        badge.textContent = idx + 1;
        row.appendChild(badge);

        const flag = document.createElement('span');
        flag.className = 'team-flag ' + getTeamFlagClass(team);
        row.appendChild(flag);

        const name = document.createElement('span');
        name.className = 'team-name';
        name.textContent = team;
        row.appendChild(name);

        const points = document.createElement('span');
        points.className = 'group-points';
        points.textContent = stat.pts + 'p';
        row.appendChild(points);

        card.appendChild(row);
      });
    }

    const hint = document.createElement('div');
    hint.className = 'group-card-hint';
    hint.textContent = complete ? 'Editar resultados' : 'Meter resultados';
    card.appendChild(hint);

    card.addEventListener('click', () => openGroupResultsModal(g));
    grid.appendChild(card);
  });
}

// ---- Render Third Place ----
function renderThirdPlace() {
  const container = document.getElementById('thirdPlacePicks');
  if (!container) return;

  syncAutoThirdPlace();
  container.innerHTML = '';

  const picked = state.thirdPlace.filter(Boolean);
  if (picked.length === 0) {
    container.innerHTML = '<p class="note-text">Se calcularán solos cuando metas todos los resultados de grupos.</p>';
    return;
  }

  picked.forEach((team, i) => {
    const tag = document.createElement('span');
    tag.className = 'third-pick-tag';
    tag.innerHTML = '<span class="third-pick-num">'+(i+1)+'</span> ' +
      '<span class="'+getTeamFlagClass(team)+'"></span> ' + team;
    container.appendChild(tag);
  });
}

// ---- Render Bracket (tournament tree) ----
function getBracketDisplayOrder() {
  const r32Order = [];
  const r16Order = [];
  const qfOrder = [];

  KO_TREE.semifinals.forEach(sf => {
    [sf.slot1.matchNum, sf.slot2.matchNum].forEach(qfNum => {
      const qfIdx = KO_TREE.quarterfinals.findIndex(m => m.num === qfNum);
      if (qfIdx !== -1) {
        qfOrder.push(qfIdx);

        const qf = KO_TREE.quarterfinals[qfIdx];
        [qf.slot1.matchNum, qf.slot2.matchNum].forEach(r16Num => {
          const r16Idx = KO_TREE.round16.findIndex(m => m.num === r16Num);
          if (r16Idx !== -1) {
            r16Order.push(r16Idx);

            const r16 = KO_TREE.round16[r16Idx];
            [r16.slot1.matchNum, r16.slot2.matchNum].forEach(r32Num => {
              const r32Idx = KO_TREE.round32.findIndex(m => m.num === r32Num);
              if (r32Idx !== -1) r32Order.push(r32Idx);
            });
          }
        });
      }
    });
  });

  return { r32Order, r16Order, qfOrder };
}

function renderBracket() {
  const container = document.getElementById('bracketContainer');
  container.innerHTML = '';
  if (!KO_TREE) return;

  const order = getBracketDisplayOrder();

  const SLOT_H = 46;
  const GAP = 10;
  const MATCH_GAP = 2;
  const LABEL_H = 32;
  const COL_W = 170;
  const CONN_W = 58;

  const MATCH_H = SLOT_H * 2 + MATCH_GAP;
  const STEP = MATCH_H + GAP;

  const cols = [
    10,
    COL_W + CONN_W,
    COL_W * 2 + CONN_W * 2,
    COL_W * 3 + CONN_W * 3,
    COL_W * 4 + CONN_W * 4
  ];

  function matchData(treeArr, ord) {
    return (ord || treeArr.map((_, i) => i)).map(i => {
      const m = treeArr[i];
      const mt = state.matchTeams[m.num] || {};
      return {
        team1: mt.team1,
        team2: mt.team2,
        winner: state.knockoutResults[m.num] || null,
        num: m.num
      };
    });
  }

  const r32 = matchData(KO_TREE.round32, order.r32Order);
  const r16 = matchData(KO_TREE.round16, order.r16Order);
  const qf = matchData(KO_TREE.quarterfinals, order.qfOrder);
  const sf = matchData(KO_TREE.semifinals);

  const r32Tree = order.r32Order.map(i => KO_TREE.round32[i]);
  const r16Tree = order.r16Order.map(i => KO_TREE.round16[i]);
  const qfTree = order.qfOrder.map(i => KO_TREE.quarterfinals[i]);
  const sfTree = KO_TREE.semifinals;

  const finMatch = KO_TREE.final ? KO_TREE.final[0] : null;
  const finNum = finMatch ? finMatch.num : 104;
  const finMt = state.matchTeams[finNum] || {};
  const finalMatch = {
    team1: finMt.team1,
    team2: finMt.team2,
    winner: state.knockoutResults[finNum] || null,
    num: finNum
  };

  const thirdMatchDef = KO_TREE.thirdPlace ? KO_TREE.thirdPlace[0] : null;
  const thirdNum = thirdMatchDef ? thirdMatchDef.num : 103;
  const thirdMt = state.matchTeams[thirdNum] || {};
  const thirdMatch = {
    team1: thirdMt.team1,
    team2: thirdMt.team2,
    winner: state.knockoutResults[thirdNum] || null,
    num: thirdNum
  };

  const r32Tops = r32.map((_, i) => LABEL_H + i * STEP);

  function centerOf(top) {
    return top + SLOT_H;
  }

  function buildTops(dstTree, srcTree, srcTops) {
    return dstTree.map(dst => {
      const s1i = srcTree.findIndex(s => s.num === dst.slot1.matchNum);
      const s2i = srcTree.findIndex(s => s.num === dst.slot2.matchNum);

      if (s1i === -1 || s2i === -1) {
        return LABEL_H;
      }

      const c1 = centerOf(srcTops[s1i]);
      const c2 = centerOf(srcTops[s2i]);

      return ((c1 + c2) / 2) - SLOT_H;
    });
  }

  const r16Tops = buildTops(r16Tree, r32Tree, r32Tops);
  const qfTops = buildTops(qfTree, r16Tree, r16Tops);
  const sfTops = buildTops(sfTree, qfTree, qfTops);

  let finalTop = LABEL_H;
  if (sfTops.length === 2) {
    finalTop = ((centerOf(sfTops[0]) + centerOf(sfTops[1])) / 2) - SLOT_H;
  }

  // El partido por el 3er puesto vive entre las dos semifinales, en la
  // misma columna de semis. La final se queda a la derecha como siempre.
  const thirdTop = finalTop;

  const maxH = LABEL_H + r32.length * STEP + 40;

  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'position:relative;height:' + maxH + 'px;min-width:' + (COL_W * 5 + CONN_W * 4 + 40) + 'px';

  ['Dieciseisavos', 'Octavos', 'Cuartos', 'Semis', 'Final'].forEach((lbl, i) => {
    const l = document.createElement('div');
    l.className = 'bracket-round-label';
    l.style.cssText =
      'position:absolute;top:2px;left:' + cols[i] + 'px;width:' + COL_W + 'px;text-align:center;';
    l.textContent = lbl;
    wrapper.appendChild(l);
  });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', maxH);
  svg.style.cssText =
    'position:absolute;top:0;left:0;pointer-events:none;z-index:1;';

  function mkPath(d) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', '#81C784');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('fill', 'none');
    return p;
  }

  function connect(srcTree, srcTops, dstTree, dstTops, srcLeft, dstLeft) {
    const sx = srcLeft + COL_W - 6;
    const dx = dstLeft + 3;
    const mx = sx + (dx - sx) / 2;

    dstTree.forEach((dst, di) => {
      const s1i = srcTree.findIndex(s => s.num === dst.slot1.matchNum);
      const s2i = srcTree.findIndex(s => s.num === dst.slot2.matchNum);
      if (s1i === -1 || s2i === -1) return;

      const y1 = centerOf(srcTops[s1i]);
      const y2 = centerOf(srcTops[s2i]);
      const yd = centerOf(dstTops[di]);

      svg.appendChild(mkPath(`M${sx},${y1} L${mx},${y1} L${mx},${yd} L${dx},${yd}`));
      svg.appendChild(mkPath(`M${sx},${y2} L${mx},${y2} L${mx},${yd} L${dx},${yd}`));
    });
  }

  function connectSemisToFinal() {
    if (sfTree.length !== 2) return;

    const sx = cols[3] + COL_W - 6;
    const dx = cols[4] + 3;
    const mx = sx + (dx - sx) / 2;
    const yd = centerOf(finalTop);

    sfTops.forEach(top => {
      const y = centerOf(top);
      svg.appendChild(mkPath(`M${sx},${y} L${mx},${y} L${mx},${yd} L${dx},${yd}`));
    });
  }

  function connectSemisToThirdPlace() {
    if (sfTops.length !== 2 || !thirdMatchDef) return;

    const x = cols[3] + (COL_W / 2) - 3;
    const upperBottom = sfTops[0] + MATCH_H;
    const lowerTop = sfTops[1];
    const thirdTopEdge = thirdTop - 6;
    const thirdBottomEdge = thirdTop + MATCH_H + 6;

    if (upperBottom < thirdTopEdge) {
      const p1 = mkPath(`M${x},${upperBottom} L${x},${thirdTopEdge}`);
      p1.setAttribute('stroke-width', '2');
      svg.appendChild(p1);
    }

    if (thirdBottomEdge < lowerTop) {
      const p2 = mkPath(`M${x},${thirdBottomEdge} L${x},${lowerTop}`);
      p2.setAttribute('stroke-width', '2');
      svg.appendChild(p2);
    }
  }

  wrapper.appendChild(svg);

  function slotDiv(team, isWinner, matchNum, slotNum, top, left, extraClass) {
  const hasTeam = Boolean(team);
  const winner = state.knockoutResults[matchNum] || null;
  const isRealWinner = hasTeam && winner && team === winner;
  const isLoser = hasTeam && winner && team !== winner;


  const d = document.createElement('div');

  d.className =
    'bracket-slot' +
    (hasTeam ? ' has-team' : ' empty-slot') +
    (isRealWinner ? ' winner' : '') +
    (isLoser ? ' loser' : '') +
    (extraClass ? ' ' + extraClass : '');

  d.style.cssText =
    'position:absolute;top:' + top + 'px;left:' + left + 'px;width:' + (COL_W - 6) + 'px;z-index:2;';

  d.innerHTML =
    '<span class="slot-flag ' + getFlagClass(team) + '"></span>' +
    '<span class="slot-name">' + (team || '---') + '</span>' +
    '<button class="slot-clear">×</button>';

  d.addEventListener('click', () => {
  const match = state.matchTeams[matchNum] || {};
  const hasBothTeams = Boolean(match.team1 && match.team2);

  if (!hasBothTeams) {
    return;
  }

  const previousWinner = state.knockoutResults[matchNum] || null;

  pickWinner(matchNum, slotNum);

  setTimeout(() => {
    const pickedEl = document.querySelector(
      `.bracket-slot[data-match="${matchNum}"][data-slot="${slotNum}"]`
    );

    if (pickedEl) {
      pickedEl.classList.remove('just-picked');
      void pickedEl.offsetWidth;
      pickedEl.classList.add('just-picked');
    }
  }, 0);
});

  d.dataset.match = matchNum;
  d.dataset.slot = slotNum;

  d.querySelector('.slot-clear').addEventListener('click', e => {
    e.stopPropagation();
    clearKnockoutAndRender(team);
  });

  return d;
}

  function drawRound(matches, tops, colIdx) {
    const left = cols[colIdx];

    matches.forEach((m, i) => {
      const top = tops[i];

      wrapper.appendChild(
        slotDiv(m.team1, m.winner === m.team1, m.num, 1, top, left, '')
      );

      wrapper.appendChild(
        slotDiv(m.team2, m.winner === m.team2, m.num, 2, top + SLOT_H, left, '')
      );
    });
  }

  connect(r32Tree, r32Tops, r16Tree, r16Tops, cols[0], cols[1]);
  connect(r16Tree, r16Tops, qfTree, qfTops, cols[1], cols[2]);
  connect(qfTree, qfTops, sfTree, sfTops, cols[2], cols[3]);
  connectSemisToFinal();
  connectSemisToThirdPlace();

  drawRound(r32, r32Tops, 0);
  drawRound(r16, r16Tops, 1);
  drawRound(qf, qfTops, 2);
  drawRound(sf, sfTops, 3);

  if (thirdMatchDef) {
    const thirdLabel = document.createElement('div');
    thirdLabel.className = 'bracket-round-label';
    thirdLabel.style.cssText =
      'position:absolute;top:' + Math.max(LABEL_H, thirdTop - 26) + 'px;left:' + cols[3] + 'px;width:' + COL_W + 'px;text-align:center;color:#2E7D32;z-index:3;';
    thirdLabel.textContent = '3er puesto';
    wrapper.appendChild(thirdLabel);

    const thirdWinner = thirdMatch.winner || null;
    wrapper.appendChild(
      slotDiv(
        thirdMatch.team1,
        Boolean(thirdMatch.team1 && thirdWinner && thirdMatch.team1 === thirdWinner),
        thirdNum,
        1,
        thirdTop,
        cols[3],
        'third-place-slot'
      )
    );
    wrapper.appendChild(
      slotDiv(
        thirdMatch.team2,
        Boolean(thirdMatch.team2 && thirdWinner && thirdMatch.team2 === thirdWinner),
        thirdNum,
        2,
        thirdTop + SLOT_H,
        cols[3],
        'third-place-slot'
      )
    );
  }

  const finalWinner = finalMatch.winner || null;

  wrapper.appendChild(
    slotDiv(
      finalMatch.team1,
      Boolean(finalMatch.team1 && finalWinner && finalMatch.team1 === finalWinner),
      finNum,
      1,
      finalTop,
      cols[4],
      ''
    )
  );

  wrapper.appendChild(
    slotDiv(
      finalMatch.team2,
      Boolean(finalMatch.team2 && finalWinner && finalMatch.team2 === finalWinner),
      finNum,
      2,
      finalTop + SLOT_H,
      cols[4],
      ''
    )
  );
  container.appendChild(wrapper);
}


function cloneMatchTeamsSnapshot() {
  return JSON.parse(JSON.stringify(state.matchTeams || {}));
}

function sameMatchTeams(a, b) {
  return (a?.team1 || null) === (b?.team1 || null) && (a?.team2 || null) === (b?.team2 || null);
}

function cleanupKnockoutAfterGroupChange(previousMatchTeams) {
  // Si cambiar un resultado de grupos mueve equipos en dieciseisavos, hay que borrar
  // cualquier pick que dependía de la foto anterior. Repetimos hasta estabilizar para
  // que caigan también octavos/cuartos/semis/final cuando su camino ya no existe.
  let changed = true;
  let guard = 0;

  while (changed && guard < 20) {
    changed = false;
    guard += 1;

    buildTPAllocation();
    computeMatchTeams();

    Object.keys(state.knockoutResults).forEach(matchNum => {
      const currentTeams = state.matchTeams[matchNum] || {};
      const previousTeams = previousMatchTeams?.[matchNum] || {};
      const pickedWinner = state.knockoutResults[matchNum];
      const winnerStillInMatch = pickedWinner && (
        pickedWinner === currentTeams.team1 || pickedWinner === currentTeams.team2
      );

      const matchupChanged = previousMatchTeams && !sameMatchTeams(previousTeams, currentTeams);

      if (!winnerStillInMatch || matchupChanged) {
        delete state.knockoutResults[matchNum];
        changed = true;
      }
    });
  }

  buildTPAllocation();
  computeMatchTeams();
}

function pickWinner(matchNum, slotNum) {
  const mt = state.matchTeams[matchNum];
  if (!mt) return;
  const team = slotNum === 1 ? mt.team1 : mt.team2;
  if (!team) return;
  if (state.knockoutResults[matchNum] === team) {
    delete state.knockoutResults[matchNum];
  } else {
    state.knockoutResults[matchNum] = team;
  }
  computeMatchTeams();
  renderAll();
  saveLocalPredictionSoon();
}

function clearKnockoutAndRender(team) {
  if (!team) return;
  Object.keys(state.knockoutResults).forEach(k => {
    if (state.knockoutResults[k] === team) delete state.knockoutResults[k];
  });
  computeMatchTeams();
  renderAll();
  saveLocalPredictionSoon();
}

// ---- Awards ----
const AWARD_SELECT_IDS = ['awardGb1', 'awardGb2', 'awardGb3', 'awardBa1', 'awardBa2', 'awardBa3'];

function getPlayerByName(name) {
  return AWARD_PLAYERS.find(p => p.name === name) || null;
}

function awardDisplayHtml(value) {
  const player = getPlayerByName(value);
  if (!player) return '<span class="award-placeholder">---</span>';

  return `
    <span class="team-flag ${getFlagClass(player.country)}"></span>
    <span class="award-player-name">${escapeHtml(player.name)}</span>
    <span class="award-player-country">${escapeHtml(player.country)}</span>
  `;
}

function ensureAwardPickerModal() {
  let overlay = document.getElementById('awardPickerModal');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'awardPickerModal';
  overlay.className = 'award-picker-overlay';
  overlay.style.display = 'none';
  overlay.innerHTML = `
    <div class="award-picker-modal" role="dialog" aria-modal="true">
      <button type="button" class="prediction-modal-close award-picker-close" aria-label="Cerrar">×</button>
      <h3 id="awardPickerTitle">Elegir jugador</h3>
      <div class="award-picker-list" id="awardPickerList"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => {
    if (e.target === overlay || e.target.closest('.award-picker-close')) {
      closeAwardPickerModal();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') {
      closeAwardPickerModal();
    }
  });

  return overlay;
}

function closeAwardPickerModal() {
  const overlay = document.getElementById('awardPickerModal');
  if (!overlay) return;
  overlay.style.display = 'none';
  overlay.dataset.selectId = '';
}

function openAwardPickerModal(select) {
  const overlay = ensureAwardPickerModal();
  const list = overlay.querySelector('#awardPickerList');
  const title = overlay.querySelector('#awardPickerTitle');
  const label = select.closest('.award-row')?.querySelector('label')?.textContent?.trim() || 'Elegir jugador';
  const currentValue = select.value || '';

  overlay.dataset.selectId = select.id;
  title.textContent = label.replace(':', '');
  list.innerHTML = '';

  const empty = document.createElement('button');
  empty.type = 'button';
  empty.className = 'award-picker-option' + (!currentValue ? ' selected' : '');
  empty.dataset.value = '';
  empty.innerHTML = '<span class="award-placeholder">---</span><span class="award-player-country">Sin elegir</span>';
  list.appendChild(empty);

  AWARD_PLAYERS.forEach(player => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'award-picker-option' + (currentValue === player.name ? ' selected' : '');
    option.dataset.value = player.name;
    option.innerHTML = `
      <span class="team-flag ${getFlagClass(player.country)}"></span>
      <span class="award-player-name">${escapeHtml(player.name)}</span>
      <span class="award-player-country">${escapeHtml(player.country)}</span>
    `;
    list.appendChild(option);
  });

  list.onclick = e => {
    const option = e.target.closest('.award-picker-option');
    if (!option) return;

    const activeSelect = document.getElementById(overlay.dataset.selectId);
    if (!activeSelect) return;

    activeSelect.value = option.dataset.value || '';
    syncAwardCustomSelects();
    activeSelect.dispatchEvent(new Event('input', { bubbles: true }));
    activeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    closeAwardPickerModal();
    saveLocalPredictionSoon();
  };

  overlay.style.display = 'flex';
}

function buildAwardCustomSelect(select) {
  let wrap = select.nextElementSibling;
  if (!wrap || !wrap.classList || !wrap.classList.contains('award-custom')) {
    wrap = document.createElement('div');
    wrap.className = 'award-custom award-popup-select';
    wrap.dataset.selectId = select.id;
    wrap.innerHTML = `
      <button type="button" class="award-custom-trigger" aria-haspopup="dialog"></button>
    `;
    select.insertAdjacentElement('afterend', wrap);
  }

  select.classList.add('award-native-hidden');

  const trigger = wrap.querySelector('.award-custom-trigger');
  trigger.innerHTML = awardDisplayHtml(select.value);

  if (!wrap.dataset.bound) {
    wrap.dataset.bound = '1';
    trigger.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openAwardPickerModal(select);
    });
  }
}

function renderAwardSelects() {
  AWARD_SELECT_IDS.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;

    const currentValue = select.value;
    select.innerHTML = '<option value="">---</option>';

    AWARD_PLAYERS.forEach(player => {
      const option = document.createElement('option');
      option.value = player.name;
      option.textContent = `${player.name} — ${player.country}`;
      select.appendChild(option);
    });

    select.value = currentValue || '';
    buildAwardCustomSelect(select);
  });
}

function syncAwardCustomSelects() {
  AWARD_SELECT_IDS.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const wrap = select.nextElementSibling;
    if (!wrap || !wrap.classList.contains('award-custom')) return;

    const trigger = wrap.querySelector('.award-custom-trigger');
    if (trigger) trigger.innerHTML = awardDisplayHtml(select.value);
  });
}

function readAwards() {
  return {
    goldenBoot: [
      document.getElementById('awardGb1')?.value || '',
      document.getElementById('awardGb2')?.value || '',
      document.getElementById('awardGb3')?.value || ''
    ],
    goldenBall: [
      document.getElementById('awardBa1')?.value || '',
      document.getElementById('awardBa2')?.value || '',
      document.getElementById('awardBa3')?.value || ''
    ]
  };
}

function fillAwards(a) {
  renderAwardSelects();

  if (!a) return;

  if (a.goldenBoot) {
    document.getElementById('awardGb1').value = a.goldenBoot[0] || '';
    document.getElementById('awardGb2').value = a.goldenBoot[1] || '';
    document.getElementById('awardGb3').value = a.goldenBoot[2] || '';
  }

  if (a.goldenBall) {
    document.getElementById('awardBa1').value = a.goldenBall[0] || '';
    document.getElementById('awardBa2').value = a.goldenBall[1] || '';
    document.getElementById('awardBa3').value = a.goldenBall[2] || '';
  }

  syncAwardCustomSelects();
}

// ---- Build Payload ----
function buildPayload() {
  computeMatchTeams();
  const awards = readAwards();

  function winners(nums) { return nums.map(n => state.knockoutResults[n]).filter(Boolean); }
  function allTeams(nums) {
    return nums.flatMap(n => { const m = state.matchTeams[n] || {}; return [m.team1, m.team2]; }).filter(Boolean);
  }
  function matchDetails(nums) {
    return nums.map(n => {
      const m = state.matchTeams[n] || {};
      return {
        match: n,
        team1: m.team1 || null,
        team2: m.team2 || null,
        winner: state.knockoutResults[n] || null
      };
    });
  }

  const r32nums = KO_TREE.round32.map(m => m.num);
  const r16nums = (KO_TREE.round16||[]).map(m => m.num);
  const qfnums  = (KO_TREE.quarterfinals||[]).map(m => m.num);
  const sfnums  = (KO_TREE.semifinals||[]).map(m => m.num);
  const finalNum = (KO_TREE.final && KO_TREE.final[0]) ? KO_TREE.final[0].num : null;
  const thirdNum = (KO_TREE.thirdPlace && KO_TREE.thirdPlace[0]) ? KO_TREE.thirdPlace[0].num : null;
  const finalMatch = finalNum ? (state.matchTeams[finalNum] || {}) : {};
  const thirdMatch = thirdNum ? (state.matchTeams[thirdNum] || {}) : {};
  const champion = finalNum ? (state.knockoutResults[finalNum] || null) : null;
  const runnerUp = champion
    ? ([finalMatch.team1, finalMatch.team2].find(team => team && team !== champion) || null)
    : null;
  const thirdPlaceWinner = thirdNum ? (state.knockoutResults[thirdNum] || null) : null;

  return {
    groups: JSON.parse(JSON.stringify(state.groups)),
    groupMatches: JSON.parse(JSON.stringify(state.groupMatches)),
    thirdPlace: state.thirdPlace.filter(Boolean),
    knockout: {
      round32: winners(r32nums),
      round16: winners(r16nums),
      quarterfinals: winners(qfnums),
      semifinals: winners(sfnums),
      final: champion,
      champion,
      runnerUp,
      finalists: [finalMatch.team1, finalMatch.team2].filter(Boolean),
      thirdPlace: thirdPlaceWinner,
      thirdPlaceWinner,
      matches: {
        round32: matchDetails(r32nums),
        round16: matchDetails(r16nums),
        quarterfinals: matchDetails(qfnums),
        semifinals: matchDetails(sfnums),
        final: finalNum ? matchDetails([finalNum]) : [],
        thirdPlace: thirdNum ? matchDetails([thirdNum]) : []
      }
    },
    semifinalists: allTeams(sfnums),
    finalists: [finalMatch.team1, finalMatch.team2].filter(Boolean),
    champion,
    runnerUp,
    thirdPlaceWinner,
    awards
  };
}

// ---- Results ----
function predictionResultStatus(predValue, realValue) {
  if (!realValue || realValue.length === 0) return 'pending';
  if (!predValue) return 'wrong';
  return predValue === realValue ? 'correct' : 'wrong';
}

function getResultOutcome(home, away) {
  if (home > away) return 'home';
  if (away > home) return 'away';
  return 'draw';
}

function getMatchResultFromMap(matchMap, match) {
  if (!matchMap || !match) return {};

  const sortedKey = match.key || groupMatchKey(match.team1, match.team2);
  const directKey = `${match.team1}__${match.team2}`;
  const reverseKey = `${match.team2}__${match.team1}`;

  return matchMap[sortedKey] || matchMap[directKey] || matchMap[reverseKey] || {};
}

function normalizeGroupMatchesForStandings(groupMatches = {}) {
  const normalized = {};

  GROUP_NAMES.forEach(group => {
    const source = groupMatches[group] || {};
    normalized[group] = {};

    getGroupMatchList(group).forEach(match => {
      normalized[group][match.key] = getMatchResultFromMap(source, match);
    });
  });

  return normalized;
}

function sameTeamSet(a, b) {
  const aa = (a || []).filter(Boolean);
  const bb = (b || []).filter(Boolean);
  if (!aa.length || aa.length !== bb.length) return false;
  const bSet = new Set(bb);
  return aa.every(team => bSet.has(team));
}

function getChampionFromPayload(payload) {
  return payload?.champion || payload?.knockout?.champion || payload?.knockout?.final || null;
}

function getRunnerUpFromPayload(payload) {
  if (payload?.runnerUp || payload?.knockout?.runnerUp) return payload.runnerUp || payload.knockout.runnerUp;

  const champion = getChampionFromPayload(payload);
  const finalists = payload?.finalists || payload?.knockout?.finalists || [];
  if (!champion || finalists.length < 2) return null;
  return finalists.find(team => team && team !== champion) || null;
}


const KNOCKOUT_SCORING = puntuaciones.eliminatorias;

function uniqueTeamList(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function getTeamsFromReviewMatches(reviewState, treeArr) {
  const teams = [];
  (treeArr || []).forEach(match => {
    const mt = reviewState.matchTeams?.[match.num] || {};
    if (mt.team1) teams.push(mt.team1);
    if (mt.team2) teams.push(mt.team2);
  });
  return uniqueTeamList(teams);
}

function getKnockoutStageTeamSets(payload) {
  if (!payload) {
    return {
      round32: new Set(),
      round16: new Set(),
      quarterfinals: new Set(),
      semifinals: new Set(),
      finalist: new Set(),
      champion: new Set(),
      thirdPlace: new Set()
    };
  }

  const reviewState = buildKnockoutReviewState(payload);
  const finalNum = KO_TREE.final?.[0]?.num;
  const thirdNum = KO_TREE.thirdPlace?.[0]?.num;
  const finalMatch = finalNum ? (reviewState.matchTeams?.[finalNum] || {}) : {};
  const thirdWinner = thirdNum ? reviewState.knockoutResults?.[thirdNum] : getThirdPlaceWinnerFromPayload(payload);
  const champion = finalNum ? reviewState.knockoutResults?.[finalNum] : getChampionFromPayload(payload);

  return {
    round32: new Set(getTeamsFromReviewMatches(reviewState, KO_TREE.round32)),
    round16: new Set(getTeamsFromReviewMatches(reviewState, KO_TREE.round16)),
    quarterfinals: new Set(getTeamsFromReviewMatches(reviewState, KO_TREE.quarterfinals)),
    semifinals: new Set(getTeamsFromReviewMatches(reviewState, KO_TREE.semifinals)),
    finalist: new Set(uniqueTeamList([finalMatch.team1, finalMatch.team2, ...getFinalistsFromPayload(payload)])),
    champion: new Set(champion ? [champion] : []),
    thirdPlace: new Set(thirdWinner ? [thirdWinner] : [])
  };
}

function getKnockoutProgressPointsForTeam(team, roundName, realStageTeams, predictedState) {
  if (!team || !roundName || !realStageTeams) return 0;

  const stageByRound = {
    round32: 'round32',
    round16: 'round16',
    quarterfinals: 'quarterfinals',
    semifinals: 'semifinals',
    final: 'finalist',
    thirdPlace: 'thirdPlace'
  };

  const stage = stageByRound[roundName];
  if (!stage) return 0;

  let points = realStageTeams[stage]?.has(team) ? (KNOCKOUT_SCORING[stage] || 0) : 0;

  if (roundName === 'final') {
    const finalNum = KO_TREE.final?.[0]?.num;
    const predictedChampion = finalNum ? predictedState?.knockoutResults?.[finalNum] : null;
    if (predictedChampion === team && realStageTeams.champion?.has(team)) {
      points += KNOCKOUT_SCORING.champion;
    }
  }

  return points;
}

function getKnockoutScoreBreakdown(prediction, results = RESULTS) {
  const predStages = getKnockoutStageTeamSets(prediction);
  const realStages = getKnockoutStageTeamSets(results);

  let score = 0;

  ['round32', 'round16', 'quarterfinals', 'semifinals', 'finalist'].forEach(stage => {
    const points = KNOCKOUT_SCORING[stage] || 0;
    predStages[stage].forEach(team => {
      if (realStages[stage].has(team)) score += points;
    });
  });

  predStages.champion.forEach(team => {
    if (realStages.champion.has(team)) score += KNOCKOUT_SCORING.champion;
  });

  predStages.thirdPlace.forEach(team => {
    if (realStages.thirdPlace.has(team)) score += KNOCKOUT_SCORING.thirdPlace;
  });

  return score;
}

function getFinalistsFromPayload(payload) {
  const explicit = payload?.finalists || payload?.knockout?.finalists;
  if (explicit && explicit.length) return explicit.filter(Boolean);

  const champion = getChampionFromPayload(payload);
  const runnerUp = getRunnerUpFromPayload(payload);
  return [champion, runnerUp].filter(Boolean);
}

function getThirdPlaceWinnerFromPayload(payload) {
  return payload?.thirdPlaceWinner || payload?.knockout?.thirdPlaceWinner || payload?.knockout?.thirdPlace || null;
}

function getSemifinalistsFromPayload(payload) {
  return payload?.semifinalists || payload?.knockout?.semifinalists || payload?.knockout?.semifinals || [];
}

function scorePrediction(prediction, results = RESULTS) {
  let score = 0;

  GROUP_NAMES.forEach(group => {
    const predGroup = prediction.groups?.[group] || [];
    const realGroup = results.groups?.[group] || [];

    if (predictionResultStatus(predGroup[0], realGroup[0]) === 'correct') score += puntuaciones.grupos.posicion.primero;
    if (predictionResultStatus(predGroup[1], realGroup[1]) === 'correct') score += puntuaciones.grupos.posicion.segundo;
    if (predictionResultStatus(predGroup[2], realGroup[2]) === 'correct') score += puntuaciones.grupos.posicion.tercero;

    const predMatches = prediction.groupMatches?.[group] || {};
    const realMatches = results.groupMatches?.[group] || {};

    getGroupMatchList(group).forEach(match => {
      const pred = getMatchResultFromMap(predMatches, match);
      const real = getMatchResultFromMap(realMatches, match);
      const ph = parseGoalValue(pred.home);
      const pa = parseGoalValue(pred.away);
      const rh = parseGoalValue(real.home);
      const ra = parseGoalValue(real.away);

      if (ph === null || pa === null || rh === null || ra === null) return;

      if (ph === rh && pa === ra) score += puntuaciones.grupos.partido.resultadoExacto;
      else if (getResultOutcome(ph, pa) === getResultOutcome(rh, ra)) score += puntuaciones.grupos.partido.ganadorEmpateCorrecto;
    });
  });

  // Third-place qualification is intentionally NOT scored here.
  // It is already reflected by the knockout-stage points if that team reaches
  // the round of 32, so group-stage scoring only rewards exact group positions.

  score += getKnockoutScoreBreakdown(prediction, results);

  const predBoot = prediction.awards?.goldenBoot || [];
  const realBoot = results.awards?.goldenBoot || [];

  if (realBoot[0] && predBoot[0] === realBoot[0]) score += puntuaciones.premios.goldenBoot[0];
  if (realBoot[1] && predBoot[1] === realBoot[1]) score += puntuaciones.premios.goldenBoot[1];
  if (realBoot[2] && predBoot[2] === realBoot[2]) score += puntuaciones.premios.goldenBoot[2];

  const predBall = prediction.awards?.goldenBall || [];
  const realBall = results.awards?.goldenBall || [];

  if (realBall[0] && predBall[0] === realBall[0]) score += puntuaciones.premios.goldenBall[0];
  if (realBall[1] && predBall[1] === realBall[1]) score += puntuaciones.premios.goldenBall[1];
  if (realBall[2] && predBall[2] === realBall[2]) score += puntuaciones.premios.goldenBall[2];

  return score;
}

// ---- Leaderboard ----

async function loadLeaderboard() {
  const res = await fetch(LEADERBOARD_CSV_URL);
  const csv = await res.text();

  const rows = parseCSV(csv);
  const submissions = [];

  rows.slice(1).forEach(row => {
    const rawJson = row[1];
    if (!rawJson) return;

    try {
      const prediction = JSON.parse(rawJson);
      submissions.push({
        name: prediction.name || 'Anonymous',
        score: scorePrediction(prediction),
        prediction
      });
    } catch (e) {
      console.warn('Invalid prediction JSON:', rawJson);
    }
  });

  submissions.sort((a, b) => b.score - a.score);
  renderLeaderboardList(submissions);
}

function parseCSV(csv) {
  const rows = [];
  let row = [];
  let value = '';
  let insideQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      value += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (value || row.length) {
        row.push(value);
        rows.push(row);
      }
      row = [];
      value = '';
      if (char === '\r' && next === '\n') i++;
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

function renderLeaderboardList(submissions) {
  const container = document.getElementById('leaderboardContent');

  container.innerHTML = `
    <div class="leaderboard-list"></div>
  `;

  const list = container.querySelector('.leaderboard-list');

  submissions.forEach((entry, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'leaderboard-entry';

    btn.innerHTML = `
      <span class="leaderboard-rank">#${index + 1}</span>
      <span class="leaderboard-name">${entry.name}</span>
      <span class="leaderboard-score">${entry.score} pts</span>
    `;

    btn.addEventListener('click', () => {
      openPredictionModal(entry);
    });

    list.appendChild(btn);
  });
}

function openPredictionModal(entry) {
  const modal = document.getElementById('predictionModal');
  const viewer = document.getElementById('predictionViewer');

  modal.style.display = 'flex';
  viewer.innerHTML = '';

  renderPredictionReview(entry);
}

function closePredictionModal() {
  const modal = document.getElementById('predictionModal');
  const viewer = document.getElementById('predictionViewer');

  modal.style.display = 'none';
  viewer.innerHTML = '';
}


function openScoringHelpModal() {
  const modal = document.getElementById('predictionModal');
  const viewer = document.getElementById('predictionViewer');

  modal.style.display = 'flex';
  viewer.innerHTML = `
    <div class="scoring-help">
      <h3>❓ Cómo se puntúa</h3>

      <div class="scoring-help-grid">
        <div class="scoring-help-card">
          <h4>🌍 Fase de grupos</h4>
          <ul>
            <li>Resultado exacto de partido: <strong>${puntuaciones.grupos.partido.resultadoExacto} pts</strong></li>
            <li>Ganador/empate correcto: <strong>${puntuaciones.grupos.partido.ganadorEmpateCorrecto} pt</strong></li>
            <li>1º exacto de grupo: <strong>${puntuaciones.grupos.posicion.primero} pts</strong></li>
            <li>2º exacto de grupo: <strong>${puntuaciones.grupos.posicion.segundo} pts</strong></li>
            <li>3º exacto de grupo: <strong>${puntuaciones.grupos.posicion.tercero} pt</strong></li>
          </ul>
        </div>

        <div class="scoring-help-card">
          <h4>🥊 Eliminatorias</h4>
          <ul>
            <li>Equipo en dieciseisavos: <strong>${puntuaciones.eliminatorias.round32} pts</strong></li>
            <li>Equipo en octavos: <strong>${puntuaciones.eliminatorias.round16} pts</strong></li>
            <li>Equipo en cuartos: <strong>${puntuaciones.eliminatorias.quarterfinals} pts</strong></li>
            <li>Equipo en semifinales: <strong>${puntuaciones.eliminatorias.semifinals} pts</strong></li>
            <li>Finalista: <strong>${puntuaciones.eliminatorias.finalist} pts</strong></li>
            <li>Campeón: <strong>+${puntuaciones.eliminatorias.champion} pts</strong></li>
            <li>Tercer puesto: <strong>${puntuaciones.eliminatorias.thirdPlace} pts</strong></li>
          </ul>
        </div>

        <div class="scoring-help-card">
          <h4>⭐ Premios individuales</h4>
          <ul>
            <li>Bota de Oro: <strong>${puntuaciones.premios.goldenBoot.join(' / ')} pts</strong></li>
            <li>Balón de Oro: <strong>${puntuaciones.premios.goldenBall.join(' / ')} pts</strong></li>
          </ul>
        </div>
      </div>

      <p class="scoring-help-note">
        La puntuación total de eliminatorias sí suma todas las decisiones acertadas. En el bracket del ranking, cada cajita muestra solo los puntos de esa ronda concreta; en la final puede sumar finalista + campeón si has clavado ambas cosas.
      </p>


      <div class="scoring-help-example">
        <div class="scoring-example-badge got-points">+3</div>
        <div class="scoring-example-text">
          Cada cuadradito verde del leaderboard representa los puntos que te ha dado esa decisión concreta:
          acertar un resultado exacto, que una selección llegue a 16avos, semis, final, etc.
        </div>
      </div>

      <div class="scoring-help-footer">
        Los resultados y las puntuaciones NO son reales, se resetearán a 0 cuando comience el mundial. Es solo un ejemplo aleatorio.
      </div>
    </div>
  `;
}

function renderPredictionReview(entry) {
  const viewer = document.getElementById('predictionViewer');

  viewer.innerHTML = `
    <div class="prediction-review">
      <h3>La predicción de ${entry.name} — ${entry.score} pts</h3>

      <h4>Fase de grupos</h4>
      <div class="review-groups" id="reviewGroups"></div>

      <h4>Knockout</h4>
      <div class="review-section" id="reviewKnockout"></div>

      <h4>Logros individuales</h4>
      <div class="review-section" id="reviewAwards"></div>
    </div>
  `;

  renderReviewGroups(entry.prediction, entry);
  renderReviewKnockout(entry.prediction);
  renderReviewAwards(entry.prediction);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function withPredictionGroupMatches(prediction, fn) {
  const oldGroupMatches = state.groupMatches;
  state.groupMatches = normalizeGroupMatchesForStandings(prediction.groupMatches || {});

  try {
    return fn();
  } finally {
    state.groupMatches = oldGroupMatches;
  }
}

function calculatePredictionGroupStandings(group, prediction) {
  return withPredictionGroupMatches(prediction, () => calculateGroupStandings(group));
}


function calculateRealGroupStandingsFromResults(group) {
  return withPredictionGroupMatches({ groupMatches: RESULTS.groupMatches || {} }, () => calculateGroupStandings(group));
}

function getQualifiedTeamsFromOrder(order, thirdsSet) {
  return new Set((order || []).filter((team, idx) => idx < 2 || (idx === 2 && thirdsSet.has(team))));
}

function getPredictionStandingReviewClass(team, predIdx, predOrder, predThirds, realOrder, realThirds) {
  const predQualified = getQualifiedTeamsFromOrder(predOrder, predThirds).has(team);
  const realQualified = getQualifiedTeamsFromOrder(realOrder, realThirds).has(team);
  const realIdx = (realOrder || []).indexOf(team);

  // Visual rule: eliminated teams must look eliminated.
  // Before this, a 3rd-place team that did NOT qualify could still become green
  // when both prediction and real result agreed it was eliminated. That made the
  // leaderboard misleading: the row looked like a qualified/correct pick.
  if (!predQualified) return ' review-wrong';

  if (predQualified && realQualified) {
    return predIdx === realIdx ? ' review-correct' : ' review-partial';
  }

  return ' review-wrong';
}


function getGroupMatchReviewPoints(ph, pa, rh, ra) {
  if (ph === null || pa === null || rh === null || ra === null) return 0;
  if (ph === rh && pa === ra) return puntuaciones.grupos.partido.resultadoExacto;
  return getResultOutcome(ph, pa) === getResultOutcome(rh, ra) ? puntuaciones.grupos.partido.ganadorEmpateCorrecto : 0;
}

function getPredictedGroupPositionPoints(team, idx, autoThirds, realOrder, realThirds) {
  // Group-stage position points are ONLY for exact positions.
  // No extra points for correctly predicting a best third: that is counted
  // later in the knockout bracket when the team appears in round of 32.
  if (predictionResultStatus(team, realOrder[idx]) !== 'correct') return 0;

  if (idx === 0) return puntuaciones.grupos.posicion.primero;
  if (idx === 1) return puntuaciones.grupos.posicion.segundo;
  if (idx === 2) return puntuaciones.grupos.posicion.tercero;
  return 0;
}

function calculateGroupReviewTotalPoints(group, prediction) {
  const matches = getGroupMatchList(group);
  const predMatches = prediction.groupMatches?.[group] || {};
  const realMatches = RESULTS.groupMatches?.[group] || {};

  const matchPoints = matches.reduce((total, match) => {
    const pred = getMatchResultFromMap(predMatches, match);
    const real = getMatchResultFromMap(realMatches, match);

    return total + getGroupMatchReviewPoints(
      parseGoalValue(pred.home),
      parseGoalValue(pred.away),
      parseGoalValue(real.home),
      parseGoalValue(real.away)
    );
  }, 0);

  const standings = calculatePredictionGroupStandings(group, prediction);
  const realOrder = RESULTS.groups?.[group] || [];
  const realThirds = new Set(RESULTS.thirdPlace || []);
  const autoThirds = new Set(prediction.thirdPlace || []);

  const positionPoints = standings.reduce((total, row, idx) => {
    return total + getPredictedGroupPositionPoints(row.team, idx, autoThirds, realOrder, realThirds);
  }, 0);

  return matchPoints + positionPoints;
}

function renderReviewPointsBadge(points, title = '') {
  const cls = points > 0 ? ' review-points-badge got-points' : ' review-points-badge no-points';
  return `<span class="${cls}"${title ? ` title="${escapeHtml(title)}"` : ''}>+${points}pt</span>`;
}

function renderStandingRow({ team, idx, pts, gf, ga, statusClass, extraClass = '' }) {
  return `
    <div class="group-team pos-${idx + 1}${extraClass}${statusClass || ''}">
      <span class="position-badge">${idx + 1}</span>
      <span class="team-flag ${getTeamFlagClass(team)}"></span>
      <span class="team-name">${escapeHtml(team)}</span>
      <span class="standings-mini">${pts} pts · ${gf}-${ga}</span>
    </div>
  `;
}

function isPredictionGroupComplete(group, prediction) {
  const predMatches = prediction.groupMatches?.[group] || {};

  return getGroupMatchList(group).every(match => {
    const result = getMatchResultFromMap(predMatches, match);
    return parseGoalValue(result.home) !== null && parseGoalValue(result.away) !== null;
  });
}

function renderReviewGroups(prediction, entry) {
  const container = document.getElementById('reviewGroups');
  container.className = 'groups-grid';
  container.innerHTML = '';

  const autoThirds = new Set(prediction.thirdPlace || []);

  GROUP_NAMES.forEach(g => {
    const complete = isPredictionGroupComplete(g, prediction);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'group-card group-card-clickable review-group-card' + (complete ? ' group-complete' : ' group-empty');
    card.title = 'Ver partidos del grupo ' + g;

    const header = document.createElement('div');
    header.className = 'review-group-card-header';

    const h3 = document.createElement('h3');
    h3.textContent = 'Group ' + g;
    header.appendChild(h3);

    const groupTotalPoints = complete ? calculateGroupReviewTotalPoints(g, prediction) : 0;
    const totalBadge = document.createElement('span');
    totalBadge.className = 'review-group-total-points' + (groupTotalPoints > 0 ? ' got-points' : ' no-points');
    totalBadge.title = 'Total de puntos conseguidos en el grupo ' + g;
    totalBadge.textContent = `+${groupTotalPoints}pt`; + (groupTotalPoints === 1 ? '' : 's');
    header.appendChild(totalBadge);

    card.appendChild(header);

    if (!complete) {
      const empty = document.createElement('div');
      empty.className = 'group-empty-preview';

      const flags = document.createElement('div');
      flags.className = 'group-empty-flags';

      (TEAMS_BY_GROUP[g] || []).forEach(teamObj => {
        const team = teamObj.name;
        const flagBox = document.createElement('span');
        flagBox.className = 'group-empty-flag-box';
        flagBox.title = team;
        flagBox.innerHTML = '<span class="team-flag ' + getTeamFlagClass(team) + '"></span>';
        flags.appendChild(flagBox);
      });

      empty.appendChild(flags);
      card.appendChild(empty);
    } else {
      const standings = calculatePredictionGroupStandings(g, prediction);
      const predOrder = standings.map(row => row.team);
      const realOrder = RESULTS.groups?.[g] || [];
      const realThirds = new Set(RESULTS.thirdPlace || []);

      standings.forEach((stat, idx) => {
        const team = stat.team;
        const isThird = idx === 2;
        const isFourth = idx === 3;
        const eliminated = isFourth || (isThird && !autoThirds.has(team));
        const statusClass = !eliminated && realOrder.length
          ? getPredictionStandingReviewClass(team, idx, predOrder, autoThirds, realOrder, realThirds)
          : (!eliminated ? ' review-pending' : '');

        const row = document.createElement('div');
        row.className =
          'group-team pos-' + (idx + 1) +
          (eliminated ? ' eliminated' : '') +
          (isThird && autoThirds.has(team) ? ' qualified-third' : '') +
          statusClass;

        row.innerHTML = `
          <span class="position-badge">${idx + 1}</span>
          <span class="team-flag ${getTeamFlagClass(team)}"></span>
          <span class="team-name">${escapeHtml(team)}</span>
          <span class="group-total-points">${stat.pts} pts</span>
        `;

        card.appendChild(row);
      });
    }

    const hint = document.createElement('div');
    hint.className = 'group-card-hint';
    hint.textContent = 'Ver partidos';
    card.appendChild(hint);

    card.addEventListener('click', () => openReadOnlyGroupResultsModal(entry, g));
    container.appendChild(card);
  });
}

function openReadOnlyGroupResultsModal(entry, group) {
  const viewer = document.getElementById('predictionViewer');
  const prediction = entry.prediction;
  const teams = (TEAMS_BY_GROUP[group] || []).map(t => t.name);
  const matches = getGroupMatchList(group);
  const predMatches = prediction.groupMatches?.[group] || {};
  const realMatches = RESULTS.groupMatches?.[group] || {};
  const standings = calculatePredictionGroupStandings(group, prediction);
  const autoThirds = new Set(prediction.thirdPlace || []);

  viewer.innerHTML = `
    <div class="group-results-editor group-results-readonly">
      <button type="button" class="toolbar-btn review-back-btn" id="backToPredictionReview">← Volver a ${escapeHtml(entry.name)}</button>
      <h3>GRUPO ${group}</h3>
      <div class="group-modal-team-grid"></div>
      <div class="group-modal-divider"></div>
      <h4 class="group-modal-section-title"><span>📅</span> PARTIDOS APOSTADOS</h4>
      <div class="group-match-list"></div>
      <div class="group-live-standings-wrap">
        <h4 class="group-modal-section-title"><span>🏆</span> CLASIFICACIÓN: APOSTADA VS REAL</h4>
        <div class="review-standings-compare review-standings-compare-with-points">
          <div class="review-standings-col">
            <div class="review-standings-label">Apostada</div>
            <div class="group-modal-standings" id="predictedGroupStandings"></div>
          </div>
          <div class="review-standings-points-col">
            <div class="review-standings-label">Puntos</div>
            <div class="review-standings-points-list" id="predictedGroupPositionPoints"></div>
          </div>
          <div class="review-standings-col">
            <div class="review-standings-label">Real</div>
            <div class="group-modal-standings" id="realGroupStandings"></div>
          </div>
        </div>
      </div>
      <div class="group-modal-info">Solo lectura: esto es lo que apostó en fase de grupos.</div>
    </div>
  `;

  const teamGrid = viewer.querySelector('.group-modal-team-grid');
  teams.forEach(team => {
    const box = document.createElement('div');
    box.className = 'group-modal-team-card';
    box.innerHTML = `
      <span class="team-flag ${getTeamFlagClass(team)}"></span>
      <span>${escapeHtml(team)}</span>
    `;
    teamGrid.appendChild(box);
  });

  const list = viewer.querySelector('.group-match-list');
  matches.forEach((match, index) => {
    const pred = getMatchResultFromMap(predMatches, match);
    const real = getMatchResultFromMap(realMatches, match);
    const ph = parseGoalValue(pred.home);
    const pa = parseGoalValue(pred.away);
    const rh = parseGoalValue(real.home);
    const ra = parseGoalValue(real.away);
    const resolved = rh !== null && ra !== null;
    const exact = resolved && ph === rh && pa === ra;
    const outcome = resolved && ph !== null && pa !== null && getResultOutcome(ph, pa) === getResultOutcome(rh, ra);
    const matchPoints = getGroupMatchReviewPoints(ph, pa, rh, ra);

    const row = document.createElement('div');
    row.className =
      'group-match-row review-match-row' +
      (exact ? ' review-correct' : '') +
      (!exact && outcome ? ' review-partial' : '') +
      (resolved && !outcome ? ' review-wrong' : '') +
      (!resolved ? ' review-pending' : '');

    row.innerHTML = `
      <div class="match-date-badge">
        <strong>${getMatchdayNumber(match, index)}</strong>
        <span>${formatMatchDate(match)}</span>
      </div>
      <div class="match-team match-team-left">
        <span class="team-flag ${getTeamFlagClass(match.team1)}"></span>
        <span>${escapeHtml(match.team1)}</span>
      </div>
      <div class="match-score-controls readonly-score-controls">
        <span class="readonly-score-box">${ph ?? 0}</span>
        <span class="score-separator">-</span>
        <span class="readonly-score-box">${pa ?? 0}</span>
      </div>
      <div class="match-team match-team-right">
        <span>${escapeHtml(match.team2)}</span>
        <span class="team-flag ${getTeamFlagClass(match.team2)}"></span>
      </div>
      <div class="review-match-points-box" title="Puntos de este partido">+${matchPoints}pt</div>
      ${resolved ? `<div class="review-real-score">Real: ${rh}-${ra}</div>` : ''}
    `;
    list.appendChild(row);
  });

  const predictedStandingsDiv = viewer.querySelector('#predictedGroupStandings');
  const positionPointsDiv = viewer.querySelector('#predictedGroupPositionPoints');
  const realStandingsDiv = viewer.querySelector('#realGroupStandings');
  const realOrder = RESULTS.groups?.[group] || [];
  const realThirds = new Set(RESULTS.thirdPlace || []);
  const predOrder = standings.map(row => row.team);

  predictedStandingsDiv.innerHTML = standings.map((row, idx) => {
    const isThird = idx === 2;
    const isFourth = idx === 3;
    const eliminated = isFourth || (isThird && !autoThirds.has(row.team));
    const statusClass = realOrder.length
      ? getPredictionStandingReviewClass(row.team, idx, predOrder, autoThirds, realOrder, realThirds)
      : ' review-pending';

    return renderStandingRow({
      team: row.team,
      idx,
      pts: row.pts,
      gf: row.gf,
      ga: row.ga,
      statusClass,
      extraClass: (eliminated ? ' eliminated' : '') + (isThird && autoThirds.has(row.team) ? ' qualified-third' : '')
    });
  }).join('');

  positionPointsDiv.innerHTML = standings.map((row, idx) => {
    const points = getPredictedGroupPositionPoints(row.team, idx, autoThirds, realOrder, realThirds);
    return `<div class="review-standing-points-row">${renderReviewPointsBadge(points, 'Puntos por esta posición')}</div>`;
  }).join('');

  realStandingsDiv.innerHTML = realOrder.map((team, idx) => {
    const realRow = calculateRealGroupStandingsFromResults(group).find(stat => stat.team === team) || { team, pts: 0, gf: 0, ga: 0 };
    const classified = idx < 2 || (idx === 2 && realThirds.has(team));

    return renderStandingRow({
      team,
      idx,
      pts: realRow.pts,
      gf: realRow.gf,
      ga: realRow.ga,
      statusClass: classified ? ' review-correct' : ' review-wrong',
      extraClass: classified && idx === 2 ? ' qualified-third' : ' eliminated'
    });
  }).join('');

  document.getElementById('backToPredictionReview').addEventListener('click', () => renderPredictionReview(entry));
}

function buildKnockoutReviewState(source) {
  const oldState = JSON.parse(JSON.stringify(state));
  const oldTpAllocation = JSON.parse(JSON.stringify(tpAllocation || {}));

  state.groups = JSON.parse(JSON.stringify(source.groups || {}));
  state.thirdPlace = [...(source.thirdPlace || [])];
  state.groupMatches = JSON.parse(JSON.stringify(source.groupMatches || {}));
  state.knockoutResults = {};
  state.matchTeams = {};

  buildTPAllocation();
  computeMatchTeams();

  const knockout = source.knockout || {};

  function setExplicitMatch(item) {
    if (!item || item.match === undefined || item.match === null) return;
    const matchNum = Number(item.match);
    if (!Number.isFinite(matchNum)) return;

    if (item.team1 || item.team2) {
      state.matchTeams[matchNum] = {
        team1: item.team1 || null,
        team2: item.team2 || null
      };
    }

    if (item.winner) {
      state.knockoutResults[matchNum] = item.winner;
    }
  }

  function setWinnerIfPossible(match, team) {
    if (!match || !team) return;
    const mt = state.matchTeams[match.num] || {};
    if (mt.team1 === team || mt.team2 === team) {
      state.knockoutResults[match.num] = team;
      computeMatchTeams();
    }
  }

  function applyRound(roundName, treeRound) {
    const explicitMatches = knockout.matches?.[roundName];

    // New payload format: use the official match number as source of truth.
    // This is important for the leaderboard review because the real bracket may
    // not be reproducible from the predicted group path. If results.js says
    // match 101 is Portugal vs Norway, the popup/bracket for match 101 must show
    // exactly that, regardless of what the computed bracket path would produce.
    if (Array.isArray(explicitMatches)) {
      explicitMatches.forEach(setExplicitMatch);
      return;
    }

    // Legacy payload format: only winner arrays, so we infer the match by team.
    const winners = knockout[roundName] || [];
    winners.forEach(team => {
      const match = treeRound.find(m => {
        const mt = state.matchTeams[m.num] || {};
        return mt.team1 === team || mt.team2 === team;
      });
      setWinnerIfPossible(match, team);
    });
  }

  applyRound('round32', KO_TREE.round32 || []);
  applyRound('round16', KO_TREE.round16 || []);
  applyRound('quarterfinals', KO_TREE.quarterfinals || []);
  applyRound('semifinals', KO_TREE.semifinals || []);
  applyRound('thirdPlace', KO_TREE.thirdPlace || []);
  applyRound('final', KO_TREE.final || []);

  // Legacy fallbacks for old results/predictions without knockout.matches.final
  // or knockout.matches.thirdPlace.
  if (KO_TREE.final?.[0] && !state.knockoutResults[KO_TREE.final[0].num]) {
    setWinnerIfPossible(KO_TREE.final[0], knockout.final || knockout.champion || source.champion);
  }

  if (KO_TREE.thirdPlace?.[0] && !state.knockoutResults[KO_TREE.thirdPlace[0].num]) {
    setWinnerIfPossible(KO_TREE.thirdPlace[0], knockout.thirdPlace || knockout.thirdPlaceWinner || source.thirdPlaceWinner);
  }

  const reviewState = JSON.parse(JSON.stringify(state));

  state.groups = oldState.groups;
  state.thirdPlace = oldState.thirdPlace;
  state.groupMatches = oldState.groupMatches;
  state.knockoutResults = oldState.knockoutResults;
  state.matchTeams = oldState.matchTeams;
  tpAllocation = oldTpAllocation;

  return reviewState;
}

function renderKnockoutBracket(reviewState, titleText, options = {}) {
  const order = getBracketDisplayOrder();

  const SLOT_H = 46;
  const GAP = 10;
  const MATCH_GAP = 2;
  const LABEL_H = 32;
  const TITLE_H = 34;
  const COL_W = 170;
  const CONN_W = 58;
  const MATCH_H = SLOT_H * 2 + MATCH_GAP;
  const STEP = MATCH_H + GAP;

  const cols = [
    10,
    COL_W + CONN_W,
    COL_W * 2 + CONN_W * 2,
    COL_W * 3 + CONN_W * 3,
    COL_W * 4 + CONN_W * 4
  ];

  function matchData(treeArr, ord) {
    return (ord || treeArr.map((_, i) => i)).map(i => {
      const m = treeArr[i];
      const mt = reviewState.matchTeams[m.num] || {};
      return {
        team1: mt.team1,
        team2: mt.team2,
        winner: reviewState.knockoutResults[m.num] || null,
        num: m.num
      };
    });
  }

  const r32 = matchData(KO_TREE.round32, order.r32Order);
  const r16 = matchData(KO_TREE.round16, order.r16Order);
  const qf = matchData(KO_TREE.quarterfinals, order.qfOrder);
  const sf = matchData(KO_TREE.semifinals);

  const r32Tree = order.r32Order.map(i => KO_TREE.round32[i]);
  const r16Tree = order.r16Order.map(i => KO_TREE.round16[i]);
  const qfTree = order.qfOrder.map(i => KO_TREE.quarterfinals[i]);
  const sfTree = KO_TREE.semifinals;

  const finMatch = KO_TREE.final?.[0];
  const finNum = finMatch ? finMatch.num : 104;
  const finMt = reviewState.matchTeams[finNum] || {};
  const finalMatch = {
    team1: finMt.team1,
    team2: finMt.team2,
    winner: reviewState.knockoutResults[finNum] || null,
    num: finNum
  };

  const thirdMatchDef = KO_TREE.thirdPlace?.[0];
  const thirdNum = thirdMatchDef ? thirdMatchDef.num : 103;
  const thirdMt = reviewState.matchTeams[thirdNum] || {};
  const thirdMatch = {
    team1: thirdMt.team1,
    team2: thirdMt.team2,
    winner: reviewState.knockoutResults[thirdNum] || null,
    num: thirdNum
  };

  const r32Tops = r32.map((_, i) => TITLE_H + LABEL_H + i * STEP);

  function centerOf(top) {
    return top + SLOT_H;
  }

  function buildTops(dstTree, srcTree, srcTops) {
    return dstTree.map(dst => {
      const s1i = srcTree.findIndex(s => s.num === dst.slot1.matchNum);
      const s2i = srcTree.findIndex(s => s.num === dst.slot2.matchNum);
      if (s1i === -1 || s2i === -1) return TITLE_H + LABEL_H;
      return ((centerOf(srcTops[s1i]) + centerOf(srcTops[s2i])) / 2) - SLOT_H;
    });
  }

  const r16Tops = buildTops(r16Tree, r32Tree, r32Tops);
  const qfTops = buildTops(qfTree, r16Tree, r16Tops);
  const sfTops = buildTops(sfTree, qfTree, qfTops);

  let finalTop = TITLE_H + LABEL_H;
  if (sfTops.length === 2) {
    finalTop = ((centerOf(sfTops[0]) + centerOf(sfTops[1])) / 2) - SLOT_H;
  }

  const thirdTop = finalTop;

  const maxH = TITLE_H + LABEL_H + r32.length * STEP + 40;

  const wrapper = document.createElement('div');
  wrapper.className = 'bracket review-knockout-bracket' + (options.extraClass ? ' ' + options.extraClass : '');
  wrapper.style.cssText =
    'position:relative;height:' + maxH + 'px;min-width:' + (COL_W * 5 + CONN_W * 4 + 40) + 'px';

  const title = document.createElement('div');
  title.className = 'review-knockout-title';
  title.style.cssText = 'position:absolute;top:0;left:10px;width:' + (COL_W * 5 + CONN_W * 4) + 'px;';
  title.textContent = titleText || '';
  if (titleText) wrapper.appendChild(title);

  ['Dieciseisavos', 'Octavos', 'Cuartos', 'Semis', 'Final'].forEach((lbl, i) => {
    const l = document.createElement('div');
    l.className = 'bracket-round-label';
    l.style.cssText =
      'position:absolute;top:' + TITLE_H + 'px;left:' + cols[i] + 'px;width:' + COL_W + 'px;text-align:center;';
    l.textContent = lbl;
    wrapper.appendChild(l);
  });

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', maxH);
  svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1;';

  function mkPath(d) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', '#81C784');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('fill', 'none');
    return p;
  }

  function connect(srcTree, srcTops, dstTree, dstTops, srcLeft, dstLeft) {
    const sx = srcLeft + COL_W - 6;
    const dx = dstLeft + 3;
    const mx = sx + (dx - sx) / 2;

    dstTree.forEach((dst, di) => {
      const s1i = srcTree.findIndex(s => s.num === dst.slot1.matchNum);
      const s2i = srcTree.findIndex(s => s.num === dst.slot2.matchNum);
      if (s1i === -1 || s2i === -1) return;

      const y1 = centerOf(srcTops[s1i]);
      const y2 = centerOf(srcTops[s2i]);
      const yd = centerOf(dstTops[di]);

      svg.appendChild(mkPath(`M${sx},${y1} L${mx},${y1} L${mx},${yd} L${dx},${yd}`));
      svg.appendChild(mkPath(`M${sx},${y2} L${mx},${y2} L${mx},${yd} L${dx},${yd}`));
    });
  }

  function connectSemisToFinal() {
    if (sfTree.length !== 2) return;

    const sx = cols[3] + COL_W - 6;
    const dx = cols[4] + 3;
    const mx = sx + (dx - sx) / 2;
    const yd = centerOf(finalTop);

    sfTops.forEach(top => {
      const y = centerOf(top);
      svg.appendChild(mkPath(`M${sx},${y} L${mx},${y} L${mx},${yd} L${dx},${yd}`));
    });
  }

  function connectSemisToThirdPlace() {
    if (sfTops.length !== 2 || !thirdMatchDef) return;

    const x = cols[3] + (COL_W / 2) - 3;
    const upperBottom = sfTops[0] + MATCH_H;
    const lowerTop = sfTops[1];
    const thirdTopEdge = thirdTop - 6;
    const thirdBottomEdge = thirdTop + MATCH_H + 6;

    if (upperBottom < thirdTopEdge) {
      const p1 = mkPath(`M${x},${upperBottom} L${x},${thirdTopEdge}`);
      p1.setAttribute('stroke-width', '2');
      svg.appendChild(p1);
    }

    if (thirdBottomEdge < lowerTop) {
      const p2 = mkPath(`M${x},${thirdBottomEdge} L${x},${lowerTop}`);
      p2.setAttribute('stroke-width', '2');
      svg.appendChild(p2);
    }
  }

  connect(r32Tree, r32Tops, r16Tree, r16Tops, cols[0], cols[1]);
  connect(r16Tree, r16Tops, qfTree, qfTops, cols[1], cols[2]);
  connect(qfTree, qfTops, sfTree, sfTops, cols[2], cols[3]);
  connectSemisToFinal();
  connectSemisToThirdPlace();
  wrapper.appendChild(svg);

  function slotDiv(team, winner, top, left, matchNum, roundName) {
    const hasTeam = Boolean(team);
    const isWinner = hasTeam && winner && team === winner;
    const matchInfo = options.matchInfoByNum?.[matchNum];
    const isClickable = Boolean(options.onMatchClick && matchInfo?.realHasMatch);
    const slotPoints = hasTeam && typeof options.getSlotPoints === 'function'
      ? Number(options.getSlotPoints(team, roundName, matchNum) || 0)
      : null;

    const d = document.createElement('div');
    d.className =
      'bracket-slot' +
      (hasTeam ? ' has-team' : ' empty-slot') +
      (isWinner ? ' winner' : '') +
      (isClickable ? ' review-match-clickable' : '');

    d.style.cssText =
      'position:absolute;top:' + top + 'px;left:' + left + 'px;width:' + (COL_W - 6) + 'px;z-index:2;' +
      (isClickable ? 'cursor:pointer;' : 'cursor:default;');

    d.innerHTML =
      (slotPoints !== null ? '<span class="review-knockout-slot-points ' + (slotPoints > 0 ? 'got-points' : '') + '">' + escapeHtml(`+${slotPoints}pt`) + '</span>' : '') +
      '<span class="slot-flag ' + getFlagClass(team) + '"></span>' +
      '<span class="slot-name">' + escapeHtml(team || '---') + '</span>' +
      (isClickable ? '<span class="review-match-info-dot" title="Ver partido real">i</span>' : '');

    if (isClickable) {
      d.setAttribute('data-match-num', String(matchNum));
      d.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        options.onMatchClick(matchNum, ev, d);
      });
    }

    return d;
  }

  function drawRound(matches, tops, colIdx) {
    const left = cols[colIdx];
    matches.forEach((m, i) => {
      const roundName = ['round32', 'round16', 'quarterfinals', 'semifinals'][colIdx] || '';
      wrapper.appendChild(slotDiv(m.team1, m.winner, tops[i], left, m.num, roundName));
      wrapper.appendChild(slotDiv(m.team2, m.winner, tops[i] + SLOT_H, left, m.num, roundName));
    });
  }

  drawRound(r32, r32Tops, 0);
  drawRound(r16, r16Tops, 1);
  drawRound(qf, qfTops, 2);
  drawRound(sf, sfTops, 3);

  if (thirdMatchDef) {
    const thirdLabel = document.createElement('div');
    thirdLabel.className = 'bracket-round-label';
    thirdLabel.style.cssText =
      'position:absolute;top:' + Math.max(TITLE_H + LABEL_H, thirdTop - 26) + 'px;left:' + cols[3] + 'px;width:' + COL_W + 'px;text-align:center;color:#2E7D32;z-index:3;';
    thirdLabel.textContent = '3er puesto';
    wrapper.appendChild(thirdLabel);

    wrapper.appendChild(slotDiv(thirdMatch.team1, thirdMatch.winner, thirdTop, cols[3], thirdMatch.num, 'thirdPlace'));
    wrapper.appendChild(slotDiv(thirdMatch.team2, thirdMatch.winner, thirdTop + SLOT_H, cols[3], thirdMatch.num, 'thirdPlace'));
  }

  wrapper.appendChild(slotDiv(finalMatch.team1, finalMatch.winner, finalTop, cols[4], finalMatch.num, 'final'));
  wrapper.appendChild(slotDiv(finalMatch.team2, finalMatch.winner, finalTop + SLOT_H, cols[4], finalMatch.num, 'final'));

  return wrapper;
}

function renderReviewKnockout(prediction) {
  const container = document.getElementById('reviewKnockout');
  container.className = 'review-knockout-click-section';
  container.innerHTML = `
    <div class="review-knockout-header">
      <div>
        <h4 class="group-modal-section-title"><span>🏆</span> ELIMINATORIAS: APOSTADO VS REAL</h4>
        <p class="note-text review-knockout-note">Haz click en un partido para comparar el cruce esperado con el cruce real, cuando ese partido real ya exista.</p>
      </div>
      <div class="review-knockout-legend" aria-label="Leyenda del bracket">
        <span><i class="legend-box legend-pred"></i> Tu predicción</span>
        <span><i class="legend-dot-info">i</i> Click = comparar partido</span>
      </div>
    </div>
  `;

  const predictedState = buildKnockoutReviewState(prediction);
  const realState = buildKnockoutReviewState(RESULTS);

  const matchInfoByNum = {};
  Object.keys(predictedState.matchTeams || {}).forEach(matchNum => {
    const realMatch = realState.matchTeams?.[matchNum] || {};
    matchInfoByNum[matchNum] = {
      realHasMatch: Boolean(realMatch.team1 && realMatch.team2)
    };
  });

  function closeKnockoutPopover() {
    document.querySelectorAll('.knockout-match-popover').forEach(el => el.remove());
  }

  function teamMini(team, winner) {
    const isWinner = team && winner && team === winner;
    return `
      <div class="knockout-popover-team ${isWinner ? 'winner' : ''}">
        <span class="slot-flag ${getFlagClass(team)}"></span>
        <span>${escapeHtml(team || '---')}</span>
      </div>
    `;
  }

  function showKnockoutMatchPopover(matchNum, ev) {
    const expected = predictedState.matchTeams?.[matchNum] || {};
    const real = realState.matchTeams?.[matchNum] || {};
    const hasRealMatch = Boolean(real.team1 && real.team2);
    if (!hasRealMatch) return;

    closeKnockoutPopover();

    const expectedWinner = predictedState.knockoutResults?.[matchNum] || null;
    const realWinner = realState.knockoutResults?.[matchNum] || null;

    const pop = document.createElement('div');
    pop.className = 'knockout-match-popover';
    pop.innerHTML = `
      <button type="button" class="knockout-popover-close" aria-label="Cerrar">×</button>
      <div class="knockout-popover-title">Partido #${escapeHtml(matchNum)}</div>
      <div class="knockout-popover-grid">
        <div class="knockout-popover-card expected">
          <div class="knockout-popover-label">Partido esperado</div>
          ${teamMini(expected.team1, expectedWinner)}
          ${teamMini(expected.team2, expectedWinner)}
        </div>
        <div class="knockout-popover-card real">
          <div class="knockout-popover-label">Partido real</div>
          ${teamMini(real.team1, realWinner)}
          ${teamMini(real.team2, realWinner)}
        </div>
      </div>
    `;

    document.body.appendChild(pop);
    pop.addEventListener('click', e => e.stopPropagation());

    const closeBtn = pop.querySelector('.knockout-popover-close');
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeKnockoutPopover();
    });

    const margin = 12;
    const rect = pop.getBoundingClientRect();
    let left = ev.clientX + 14;
    let top = ev.clientY + 14;

    if (left + rect.width + margin > window.innerWidth) {
      left = Math.max(margin, ev.clientX - rect.width - 14);
    }
    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, ev.clientY - rect.height - 14);
    }

    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;

    setTimeout(() => {
      document.addEventListener('click', closeKnockoutPopover, { once: true });
    }, 0);
  }

  const realStageTeams = getKnockoutStageTeamSets(RESULTS);

  function getBracketSlotPoints(team, roundName) {
    return getKnockoutProgressPointsForTeam(team, roundName, realStageTeams, predictedState);
  }

  const pane = document.createElement('div');
  pane.className = 'bracket-wrapper review-knockout-pane review-knockout-click-pane';

  const predictedBracket = renderKnockoutBracket(predictedState, '', {
    extraClass: 'review-knockout-predicted review-knockout-clickable-bracket',
    matchInfoByNum,
    getSlotPoints: getBracketSlotPoints,
    onMatchClick: showKnockoutMatchPopover
  });

  pane.appendChild(predictedBracket);
  container.appendChild(pane);
}

function renderReviewAwards(prediction) {
  const container = document.getElementById('reviewAwards');
  container.className = 'awards-section';
  container.innerHTML = '';

  const rows = [
    [`🏆 Bota de oro (${puntuaciones.premios.goldenBoot[0]}pt)`, prediction.awards?.goldenBoot?.[0], RESULTS.awards?.goldenBoot?.[0]],
    [`🥈 Bota de plata (${puntuaciones.premios.goldenBoot[1]}pt)`, prediction.awards?.goldenBoot?.[1], RESULTS.awards?.goldenBoot?.[1]],
    [`🥉 Bota de bronce (${puntuaciones.premios.goldenBoot[2]}pt)`, prediction.awards?.goldenBoot?.[2], RESULTS.awards?.goldenBoot?.[2]],
    [`🏆 Balón de oro (${puntuaciones.premios.goldenBall[0]}pt)`, prediction.awards?.goldenBall?.[0], RESULTS.awards?.goldenBall?.[0]],
    [`🥈 Balón de plata (${puntuaciones.premios.goldenBall[1]}pt)`, prediction.awards?.goldenBall?.[1], RESULTS.awards?.goldenBall?.[1]],
    [`🥉 Balón de bronce (${puntuaciones.premios.goldenBall[2]}pt)`, prediction.awards?.goldenBall?.[2], RESULTS.awards?.goldenBall?.[2]]
  ];

  rows.forEach(([label, predicted, real]) => {
    const resolved = Boolean(real);
    const correct = resolved && predicted === real;
    const wrong = resolved && predicted !== real;

    const row = document.createElement('div');
    row.className =
      'award-row' +
      (correct ? ' review-correct' : '') +
      (wrong ? ' review-wrong' : '') +
      (!resolved ? ' review-pending' : '');

    row.innerHTML = `
      <label>${label}:</label>
      <div class="award-custom award-readonly">
        <div class="award-custom-trigger" style="cursor:default;">
          ${awardDisplayHtml(predicted)}
        </div>
        ${resolved ? `
          <small style="display:block;font-weight:700;margin-top:6px;">
            Actual:
            <span style="display:inline-flex;align-items:center;gap:6px;">
              ${awardDisplayHtml(real)}
            </span>
          </small>
        ` : ''}
      </div>
    `;

    container.appendChild(row);
  });
}

// ---- Scoring ----
function calculateScore(prediction, results) {
  return scorePrediction(prediction, results);
}

// ---- Leaderboard ----
function renderLeaderboard(entries) {
  const div = document.getElementById('leaderboardContent');
  if (!entries || entries.length === 0) {
    div.innerHTML = '<p class="note-text" style="margin-top:20px;">No predictions found.</p>';
    return;
  }
  entries.sort((a,b) => b.score - a.score);

  const table = document.createElement('table');
  table.className = 'leaderboard-table';
  table.innerHTML = `<thead><tr><th>#</th><th>Name</th><th>Score</th><th>Champion</th></tr></thead><tbody></tbody>`;
  const tbody = table.querySelector('tbody');

  entries.forEach((e, idx) => {
    const tr = document.createElement('tr');
    if (idx === 0) tr.className = 'rank-1';
    tr.innerHTML = `<td>${idx===0?'<span class="rank-crown">👑</span> ':''}${idx+1}</td><td>${e.name}</td><td>${e.score}</td><td>${e.champion||'--'}</td>`;
    tbody.appendChild(tr);
  });

  div.innerHTML = '';
  div.appendChild(table);
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') { if (text[i+1]==='"') { field+='"'; i++; } else inQuotes = false; }
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i+1]==='\n') i++;
        row.push(field); field = '';
        if (row.length) rows.push(row);
        row = [];
      } else field += ch;
    }
  }
  row.push(field);
  if (row.length || field) rows.push(row);
  return rows;
}

// ---- Submit ----
const FORM_ACTION = 'https://docs.google.com/forms/d/e/'+FORM_ID+'/formResponse';

function submitPrediction() {
  openNameModal();
}

function openNameModal() {
  const modal = document.getElementById('nameModal');
  const input = document.getElementById('playerNameInput');

  modal.style.display = 'flex';
  input.value = '';
  setTimeout(() => input.focus(), 50);
}

function closeNameModal() {
  document.getElementById('nameModal').style.display = 'none';
}

async function confirmSubmitPrediction() {
  const input = document.getElementById('playerNameInput');
  const playerName = input.value.trim();

  if (!playerName) {
    showToast('Please enter your name.', true);
    input.focus();
    return;
  }

  const payload = buildPayload();
  payload.name = playerName;
  payload._submittedAt = new Date().toISOString();

  const params = new URLSearchParams();
  params.append(ENTRY_ID, JSON.stringify(payload));

  closeNameModal();
  showLoading('Publicando...');

  try {
    await fetch(FORM_ACTION, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    hideLoading();
    fireConfetti();
    showToast('Listo, buena suerte. Puede tardar unos segundos en aparecer en el ranking.');
  } catch(e) {
    hideLoading();
    showToast('Error. Inténtalo otra vez o avísame.', true);
  }
}

// ---- Master Render ----
function renderAll() {
  buildTPAllocation();
  computeMatchTeams();
  renderGroups();
  renderThirdPlace();
  renderBracket();
  renderAwardSelects();
  loadLeaderboard();
}

function resetState() {
  GROUP_NAMES.forEach(g => {
    state.groups[g] = TEAMS_BY_GROUP[g].map(t => t.name);
  });

  state.groupMatches = {};
  ensureAllGroupMatches();
  updateAllGroupOrdersFromMatches();

  state.thirdPlace = [];

  state.knockoutResults = {};
  state.matchTeams = {};
  state.knockout = {};

  state.awards = {
    goldenBoot: ['', '', ''],
    goldenBall: ['', '', '']
  };

  fillAwards(state.awards);
  clearLocalPrediction();
  renderAll();

  showToast('A tomar por culo.');
}

// ---- Init ----
async function init() {
  showLoading('Loading tournament data...');
  const ok = await loadData();
  hideLoading();
  if (!ok) { showToast('Failed to load tournament data. Check connection and reload.', true); return; }

  // Clear stale localStorage from old incompatible data
  const v = localStorage.getItem(LOCAL_STORAGE_VERSION_KEY);
  if (v !== LOCAL_STORAGE_VERSION) {
    localStorage.removeItem(LOCAL_STORAGE_PICKS_KEY);
    localStorage.setItem(LOCAL_STORAGE_VERSION_KEY, LOCAL_STORAGE_VERSION);
  }

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-'+btn.dataset.tab).classList.add('active');
    });
  });

  document.getElementById('btnReset').addEventListener('click', () => {
    resetState();
    computeMatchTeams();
    renderAll();
  });
  const btnScoringHelp = document.getElementById('btnScoringHelp');
  if (btnScoringHelp) {
    btnScoringHelp.addEventListener('click', openScoringHelpModal);
  }
  document.getElementById('btnSubmit').addEventListener('click', submitPrediction);
  document.getElementById('confirmNameSubmit').addEventListener('click', confirmSubmitPrediction);
  document.getElementById('cancelNameSubmit').addEventListener('click', closeNameModal);
  document.getElementById('playerNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmSubmitPrediction();
    if (e.key === 'Escape') closeNameModal();
  });

  document.getElementById('closePredictionModal').addEventListener('click', closePredictionModal);

  document.getElementById('predictionModal').addEventListener('click', e => {
    if (e.target.id === 'predictionModal') closePredictionModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closePredictionModal();
      closeAwardPickerModal();
    }
  });


  restoreLocalPrediction();
  fillAwards(state.awards);
  computeMatchTeams();
  renderAll();

  document.querySelectorAll('#awardGb1,#awardGb2,#awardGb3,#awardBa1,#awardBa2,#awardBa3').forEach(el => {
    el.addEventListener('input', saveLocalPredictionSoon);
    el.addEventListener('change', saveLocalPredictionSoon);
  });

  if (window.location.hash === '#leaderboard') {
    document.querySelector('[data-tab="leaderboard"]').click();
  }
}

document.addEventListener('DOMContentLoaded', init);
