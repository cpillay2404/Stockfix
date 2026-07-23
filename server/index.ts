import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";
import { startWeeklyEmailScheduler } from "./scheduled-emails";
import { startPilotBackupScheduler } from "./pilot-backup";
import cors from "cors";

const app = express();

// Allow any origin to call this API (external HTML tools, automation portals, etc.)
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Serve uploaded images from public/images
app.use('/images', express.static(path.join(process.cwd(), 'public/images')));
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '200mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '200mb' }));

// Increase timeout for large file uploads (5 minutes)
app.use((req, res, next) => {
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  if (req.path.includes('qr')) {
    console.log(`[QR-DEBUG] Request received: ${req.method} ${req.url} path=${req.path}`);
  }
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    async () => {
      log(`serving on port ${port}`);
      startWeeklyEmailScheduler();
      startPilotBackupScheduler();

      // ONE-TIME STARTUP SCRIPT: Fix mis-parsed week ending dates (2026-03-12 → 2026-03-11)
      // Excel serial numbers were off by one day during import
      // Remove this block after one successful production deploy
      try {
        const { db } = await import("./db");
        const { tasks } = await import("@shared/schema");
        const { eq, sql } = await import("drizzle-orm");
        
        // Fix weekEndingDate
        const dateResult = await db.update(tasks)
          .set({ weekEndingDate: '2026-03-11' })
          .where(eq(tasks.weekEndingDate, '2026-03-12'));
        console.log('[STARTUP SCRIPT] Fixed weekEndingDate: 2026-03-12 → 2026-03-11');
        
        // Fix uniqueIds that contain the wrong date
        await db.execute(sql`
          UPDATE tasks 
          SET unique_id = REPLACE(unique_id, '2026-03-12', '2026-03-11')
          WHERE unique_id LIKE '%2026-03-12%'
        `);
        console.log('[STARTUP SCRIPT] Fixed uniqueIds: 2026-03-12 → 2026-03-11');
      } catch (err) {
        console.error('[STARTUP SCRIPT] Date fix error:', err);
      }

      // ONE-TIME STARTUP SCRIPT: Fix Shameer Williams rep assignments (RENE MAROULIS → SHAMEER WILLIAMS)
      // Remove this block after one successful production deploy
      try {
        const { db: db2 } = await import("./db");
        const { sql: sql2 } = await import("drizzle-orm");
        const fixResult = await db2.execute(sql2`
          UPDATE tasks SET line_manager = 'SHAMEER WILLIAMS'
          WHERE UPPER(TRIM(line_manager)) = 'RENE MAROULIS'
          AND UPPER(TRIM(rep_name)) IN (
            'ANATHI MARTINS','APHIWE KAINGANA','BAMANYE SIFUMBA',
            'JAMES DE WITT','NTLAHLA NANINI','YEKISWA MAKANDA','LUCA HARTSENBERG'
          )
        `);
        console.log('[STARTUP SCRIPT] Fixed Shameer rep assignments:', fixResult.rowCount, 'rows updated');
      } catch (err) {
        console.error('[STARTUP SCRIPT] Shameer fix error:', err);
      }

      // STARTUP SCRIPT: Sync pilot rep list — deactivate removed reps, add new starters (joined_date=2026-07-22)
      try {
        const { db: db3 } = await import("./db");
        const { sql: sql3 } = await import("drizzle-orm");
        const NEW_LIST: string[] = [
          "Micaela Joseph", "Katlego Hlongwane", "Bongokuhle Knowledge Tyuthwana", "Shameela Van Briessies", "Ricado De Villiers",
          "Johannah Moipone Putuka", "Steven Collen Mabunda", "Mabote Mokoena", "Hilton Abtrahams", "Mary Mkhabela",
          "Thabe Sekokotla", "Andisiwe Ndisila", "Celokuhle Langa", "Jotham Jabulane Simelane", "Aphiwe Kaingana",
          "Nothemba Cwera", "Obakeng Mafoko", "Solly Rabodiba", "William Thabo Chauke", "Brighton Vutsulu",
          "Nomvula Happiness Ngcongo", "Ntokozo Majozi", "Carmen Rhode", "Mathome Thomas Thamaga", "Chandre Frans",
          "Joseph Senso Ndlovu", "Edwin Macroni", "Bongani Lucky Dlomo", "Bayanda Philasande Vezi", "Nkosingiphile Khumalo",
          "Bophelo Mfuphi", "Thobani Ndlovu", "Kwandile Mxolisi Dube", "Sylvia Erasmus", "Naledi Thomas",
          "Busisiwe Penelope Mabuza", "Nzama Given Mkhari", "Nthabiseng Mokoena", "Ashley Pietersen", "Rachel Sedutla",
          "Simon Ndlovu", "Sibongiseni Jeffrey Mdlovu", "Phathokuhle Queeneth Nsibande", "Kholeka Asanda Gumbi", "Slindile Ndawonde",
          "Letlhogonolo Joseph Khonza", "Halalisani Mthethwa", "Shaun Daniels", "Shanice Trout", "Amanda Ntshethu",
          "Emihle Njani", "Owami Mtetwa", "Thokozani Vusi Nkosi", "Bongekile Mphuthi", "Mbali Sithole",
          "Grace Pokane", "Boitshwarelo Motebe", "Zokhanyo Dzanibe", "Tyrone Lenford Johnson", "Mthobisi Blessing Dlamini",
          "Mlondi Ngubane", "Ayanda Mntungwa", "Jimmy Rodney Sello", "Sibusiso Mayandile Nxumalo", "Kim-Lynn Carolus",
          "Rinaye Mufamadi", "Lulama Mgqalu", "Mmapula Ellen Motloung", "Marchell Davids", "Nkokhelo Dolphas Khumalo",
          "Steve Mokhonoana", "Ayanda James", "Sihle Hope Sibiya", "Mercia Lombard", "Khutso Bradley Raseote",
          "Ikanyeng Laurence Maseko", "Calvin Leburu Raphasha", "Keagan Cedras", "Imraan Williams", "Calvin Kamogelo Ntuli",
          "Antonio Newman", "Zanele Sibiya", "Dudley Claasen", "Keenan Dirks", "Simphiwe Mofokeng",
          "Antonia Sanelisiwe Ndlela", "Thandisizwe Nkosi", "Puleng Mothijoa", "Tshegofatso Eugene Hlako", "Takalani Philemon Munyai",
          "Crystal-Lee Uithaler", "Aron Zakhele Ndlangamandla", "Celukwanda Mlamu Shabangu", "Frans Phetla", "Anathi Martins",
          "Moipone Malakoane", "Refiloe Felicia Mabunda", "Mosima Brigette Monyelo", "Amber Martin", "Immaculate Ntombela",
          "Phumeza Moreen Bona", "Keabetswe Jacob Mokoena", "Kamogelo Ratema", "Nadeema Van Wyk", "Luzaan Plaatjies",
          "Chrisheel Gordon", "Bonolo Makhutlhe", "Happy Sango", "Thabang Ndlovu", "Phumlani Ian Vilane",
          "Onnicah Nontsikelelo Hlatywayo", "Ofentse Colin Radebe", "Tinyiko Sherman Khosa", "Sibonelo Maduna", "Kamva Chulumanco Vusani",
          "Amos Masanabo", "Trust Monwabisi Mbata", "Tsiamo Mbonani", "Nomasixole Mzukwa", "Lungile Notuku",
          "Sibongiseni Vusumuzi Nkosi", "Kolobe Donald Nkhuna", "Neliswa Ngetu", "Aubrey Sekgoale", "Baba Forgiveness Motaung",
          "Kgothatso Saleng", "Makhacani William Khoza", "Alroy Johnson", "Ntuthuko Banathi Gcabashe", "Mthandeni Derrick Bhengu",
          "Monicca Lydia Tshabalala", "Lungelo Cedric Makhaza", "Yvonne Tebogo Mtshana", "Kabelo Mokgosinyana", "Karabo Molefe Mabuya",
          "Siyabonga Ndlovu", "Cliford Sifiso Mbuyazi", "Pilato Mamodiane Mmatshipyane", "Nokwenza Ndlovu", "Tamaryn Thomas",
          "Pitso Moseme", "Amanda Felicia Molefe", "Byron Lukas", "Fahiema Basier", "Fundisiwe Pretty Nqobile Dladla",
          "Abinaar Letlonkane", "Thembeka Coren Zwane", "Glenwill Aries", "Mbalenhle Khathi", "Precious Mathapelo Gasenewe",
          "Donovan Dunston", "Attwell Senzo Manzini", "Zusiphe Gogo", "Nyameka Rilityana", "Kagiso Mbonambi",
          "Moitswadi Jonny Mashala", "Eon Europa", "Themba James Kwenda", "Heinrich Fortuin", "Natasha Eland",
          "Nompilo Shange", "Buhlebuyeza Mashiya", "Khomotso Sathekge", "Ngoako Voster Serumula", "Khabo Precious Mbuyane",
          "Dipuo Margareth Malepe", "Bamanye Sifumba", "Michaella Pedro", "Nolwando Vokwana", "Matswitswiri Wilton Sekele",
          "Lwazi Mzobe", "Justin Appollis", "Nkululeko Patrick Khumalo", "Sibongile Pinkie Sigudla", "Zanele Queenrose Leba",
          "Fortune Mashilo Makola", "Fezeka Moni", "Alina Maleka", "Celeste Schoeman", "Edwin Mkhabela",
          "Msawakhe Hlongwa", "Samkelo Ndubane", "Michael Khumalo", "Precious Mabunga", "Zuzani Bulawa",
          "Jane Spaere", "Yekelwa Mnqayi", "Inga Dlanga", "Mvuso Keith Kunene", "Motshidisi Kodisang",
          "Jane Jabulile Mashinini", "Alecia Meyer", "Ronaldo Adams", "Luyanda Brian Mthembu", "Nokwazi Angel Sikhakhane",
          "Andile Sulo", "Logan Amon", "Chante Sebia", "Mthuthuzeli Nondabula", "Mayo Joy Lindoor",
          "Karabo Mphete", "Sesethu Makibi", "Jerome Naidoo", "Moloko Peresina Moshupya", "Mapaseka Palisa Nkosi",
          "Collins Phosa", "Asibonge Khuluse", "Monwabisi Kuse", "Bafana Clifford Mavuso", "Beki Stephen Maruping",
          "Abram Mathabathe", "BRILIENT BENNEDICT MKASI", "Bradley Philander", "Bongane Masango", "Anele Gongo",
          "Phikela Ngamlana", "Julia Mosekare", "Enrico Davids", "Ntuthuko Innocent Mthembu", "Lethukuthula Siphesihle Mkhize",
          "Sibusiso Makundayi", "Gaven Moses Sifiso Springkaan", "Negrose Bhuti Mashele", "Mzwakhe Makhanya", "Ndumiso Daniel Ndladlama",
          "Avela Bradley Mutele", "Lwando Mvundlela", "Dingane Patrick Dhlamini", "Adam Chauke", "Chrisna Vraagom",
          "Njabulo Cele", "Itumeleng Victoria Pheko", "Hopewell Sibusiso Leshalabe", "Linda Brilliant Buthelezi", "Michelle Koeries",
          "Akahlulwanto Sakhile Mbiko", "Keamogetswe Nicole Nomakhosi Makuoa", "Philisiwe Dingi", "Ashwin Darling", "Beauty Sivalo",
          "Kagisho Kopeledi", "Aldoraan Champion", "Michelle Matebane", "Sebolelo Modise", "Shadrack Sehinye",
          "Lwazi Knowledge Gumede", "Biopelo Edward Legare", "Christian Lesch", "Stokie Dorothia Thobane", "Matthews Matebesi Tsweledi",
          "Basetsana Madika", "Darryl Human", "Manoko Adolphina Duba", "Fikile Enicah Letsane", "Themba George Mabona",
          "Daniel Thabo Zimtemi", "Moses Sesupo", "Jeffrey Chauke", "Leswifi Gosnaty Mahlo", "Mirriam Mmanini Motloung",
          "Nonina Mampondo", "Moleko Phillemon Leshage", "Nonkosi Njambatwa", "Ramesh Moodaley", "Dumisani Clement Motha",
          "Minenhle Kwanele Nsindane", "Robert Madumetja Teffo", "Lincon Tshanyana", "Elias Mathata Ngulinga", "Gloria Matshepho Rapetswa",
          "Mhlengi Ntethelelo Sithole", "Lesego Lorraine Mokgatle", "Zibuyile Msweli", "Lucky Chauke", "Chulumanco Tshefu",
          "Gladman Hlatshwayo", "Tanisha Gawie", "Khona Mapuza", "Thabane Cedric Zwane", "Jaqueline Wyngaard",
          "Paseka Goodfriday Mkwayi", "Sduduzo Cyril Ntuli", "Trevor Lekwadi Maponya", "Jvan Swartland", "Dikonketso George Mashaba",
          "Alpheus Thoki Matlala", "Lindani Ngcobo", "Gunther Booysen", "Andile Mbokazi", "Kamogelo Priscilla Tshanke",
          "Mmakgomo Marishen Letsoalo", "Tshepiso Jerry Ndala", "Kamogelo Hertina Tabudi", "Elridge Mavhungu Mudau", "Dumisani Welcome Zulu",
          "Demond Botubelo", "Lerato Cynthia Mokgatle", "Mantshadi Olga Rahlaho", "Lesego Khumalo", "Khanyisile Elizabeth Nkonde",
          "Nhlanhla Mapumula", "Ayanda Ndimande", "Mbongeni Buda", "Abednigo Vusimuzi Mntambo", "Isenathi Gwabeni",
          "Lemeck Thipe Sealetsa", "Mirichan Cloete", "Janine Jacobs", "Nosiphiwo Ludziya", "Abie Mphekeledi Mlangeni",
          "Khululiwe Gazu", "Pascall Osborne", "Maria Mpambane", "Winston Cupido", "Sikelela Mjucu",
          "Isaac George Malatse", "Lufumo Jeremia Mutshinya", "Anika Windvogel", "Luca Hartsenberg", "Christina Sibongile Legasa",
          "Lenah Motaung", "Ismaell Willaims", "Sipho Lubisi", "Hlengiwe Maphanga", "Makobo Maggi Mukhari",
          "Portia Mbira", "Lettie Dineo Moolisa", "Maria Bridget Ndhlovu", "Robertia Jacobs", "Tyrique Maarman",
          "Nkanyiso Gift Mchunu", "Kwazikwenkosi Lwazi Khumalo", "Thabang Philemon Thebe", "Lindelwa Mathole", "Mmalekwena Mpho Ramoloto",
          "Nhlanhla Madike", "Dineo Moahi", "Mandithwale Bulala", "David Leeato Mdanda", "Lulama Galada",
          "Ntombi Koko", "Asisipho Dambuza", "Thabiso Kgope", "Lesedi Magdeline Segobola", "Nomfundo Precious Cele",
          "Jackson Latisang Matshwane", "Zanele Fakude", "Nomfundo Shange/Mdlalose", "Sibongiseni Clement Ngwenya", "Sabelo Humphrey Mosea",
          "Bandile Nathan Shelembe", "Seluleko Nyawose", "Zandile Pretty Gwala", "Nkosingiphile Mkhwanazi", "Lusanda Sifiso Mthethwa",
          "Nontuthuko Mahaye", "Nokulunga Veronica Nkomo", "Syabonga Ngcobo", "Mthwakazi Mtintso", "Nhlakanipho Mangeni",
          "Sibusile Ntombela", "Terneil Pillay", "Boy Buthelezi", "Evelyn Malebele Phoshono", "Lindah Hlatshwayo",
          "Sylivia Ngwenya", "Helen Schalkwyk", "Fateeq Abdurahman", "Nthabiseng Monkie Njomo", "Palesa Joyce Khanye",
          "Caroline Motsamai Rasetanga", "Karabo Thabo Dube", "Melita Masenya", "Sivuyile Nyembe", "Chuma Roto",
          "Nonjabulo Mbambo", "Matshidiso Innocentia Make", "Simon Matome Mabena", "Zayaan van Zyl", "Kelly Phasha",
          "Constance Lerato Tshoma", "Maphefo Naome Mashiloane", "Nadine Dirks", "Clement Moalusi Masokwane", "Simphiwe Lucky Mavundla",
          "Esther Molosiwa", "Mzwakhe Elias Nkosi", "Sibusiso Ernst Ngobeni", "Alphonsina Dirks", "Ketiwe Sibisi",
          "Chevonne Abrahams", "Magdalene George", "Kgomotso Rebecca Nkwana", "Crystal Arendse", "Roxanne Hofmeester",
          "Nombuso Duma", "Prisca Ndaba", "Thabo Abednigo Guliwe", "Themba Solomon Skosana", "Alisha Slinger",
          "Nkosingiphile Gumede", "Thando Gwala", "Zaydah Smith", "Mfanafuthi Nonkobongo", "Emily Mmatlala Sekwediso",
          "Mafusi Mothoalo", "Lebohang Ernest Mokopane", "Dunecia van Wyk", "Edwin Phuti Nkoana", "Tshepang Talita Molalo",
          "Moleboheng Molise", "Khensani Hlongwane", "Mandipha Ntlebi", "Amelia Gerwell", "Zoliswa Nyeleka",
          "Tshepo Chobokoane", "Petrus Thibiri", "Tumelo Molebaleng Mokolo", "Stephmaine Farmer", "Jeffrey Mzwandile Shandu",
          "Melokuhle Melody Nene", "Andile Maqhawe Sithole", "Tshepo Rametsi", "Elizabeth Hildah Monyatsi", "Zimkhitha Mvoti",
          "Mxolisi Frenando Mokoena", "Crystal Tebatso Matsimela Magutla", "Joseph Oupa Shingange", "Alfred Tshepo Mashaba", "Ezekiel Bafana Tibane",
          "Thina Shiyani", "George Paul Mathebula", "Sinethemba Dlamini", "Siyabonga Thembinkosi Radebe", "Pule Angel Mashinye",
          "Nomathamsanqa Cheryl Malinga", "Thandokazi Mfuma", "Khotso Mokhele", "Nomakwezi Mangoloti", "Willy Bester",
          "Thembalethu Ngxaka", "Ntombizethu Notshulwana", "Refilwe Lettie Ndukula", "Sibusiso Alfred Mkhatswa", "Nkosibonile Mtembu",
          "Piet Van Rooy", "Sylvia Dikotedi Mapetla", "Siphiwe Rodrick Machele", "Butsang Jacob Mogole", "Sicelo Wonderful Kubone",
          "Hlohonolofatso Knowledge Malope", "Sithabiso Goodman Khumalo", "Dineo Precious Mkhwanazi", "Bawinile Priscilla Shili", "Kagiso Zwane",
          "Ashkin Goliath", "Xolani Jeffrey Mhlanga", "Vhonani Phainos Mbedzi", "Nozicelo Princess Mbube", "Marcello Abrahams",
          "Nandisa Nomthandazo Mbense", "Josiah Dladla", "Thandokazi Elizabeth Dekeda", "Katlego Kekana", "Shamondre Adams",
          "Mpho Eleminah Motsei", "Willie Davids", "Montsheng Louisa Ditshego", "Bulelwa Nqakula", "Lebogang Joshua Mawasha",
          "Rito Nkuna", "Lebo Gilbert Sekgola", "Emanuel Selowa", "Sepelong Shallot Mashapa", "Derrick Monwabisi May",
          "Yekiswa Makanda", "Mamello France Nyambe", "Vincent Xolani Mwelase", "Sbusiso Emmanuel Vilakazi", "Aubrey Rudolph Mohlala",
          "Naso Mabhele", "Christinah Dineo Mabunda", "Tebogo Simon Molife", "Priscilla Siphindile Luthuli", "Alanzo Vass",
          "Masesi Mestice Xaba", "Irvin Christopher Pieterse", "Meriam Masingita Ngobeni", "Sivuyile Nkomombini", "Rosina Tebogo Mathipa",
          "Banele Victor Dlamini", "Mathews S'khumbuzo Mtetwa", "Nokubekezeka Sindisiwe Silungile Mhlanga", "Tebogo Thobela", "Agrineth Nonhlanhla Dubazana",
          "Masibulele Ndima", "Makopo Joseph Chabalala", "Andile Innocent Mabuza", "Andile Knowledge Myeni", "Mac- Donald Johannes Mogotsi Rampou",
          "Duduzile Philadelphia Khoza", "Khethekile Victoria Ngwenya", "Wilson Sabelo Mtshali", "Faith Nkosi", "Malenkoe Lenkwe",
          "Siphiwo Cingo", "Motlatsi Thopa", "Kamogelo Sethunywa", "Mamanaka Seta Ntane", "Ntombovuyo Hoboyi",
          "Simon Arnold Dube", "Linathi Gushu", "Smiso Sabelo Ngonyama", "Linda Mhlabi", "Susan Khomotso Masuku",
          "Zolani Daweti", "Keeditseng Emily Motadinyane", "Suzan Khangale", "Belinda Adams", "Juliane Kerspay",
          "Andisiwe Yaka", "Nicole Hess", "Thembalethu Minenhle Mbatha", "Balisa Mgonyonga", "Rebecca Reshoketswe Mabena",
          "Ashley Rhoode", "Xolile Gift Ntozakhe", "Zamani Mazibuko", "Tshepo Motsamai", "Godfrey Molaba",
          "Aaron Rihlamvu", "Bridgette Isabella Msiza", "Zandile June Dibate", "Ntomfikile Maqa", "Mbali Mlotshwa",
          "Zethu Kunene", "Nelisiwe Khanyile", "Elvino Cupido", "Rodwill Boesak", "Ntombenkosi Tan Tan",
          "Claudia Slambee", "Kholiswa Zono", "Nkosisikelela Nzuzo Zungu", "Menzi Ndlovu", "Muzikayise Mayisela",
          "Mbali Precious Mgobhozi", "Sfiso Wiseman Mkhize", "Sara Singo", "Zenobia Hillmary Wildschut", "Senzo Mvelase",
          "Eunice Makgalemele", "Mashego Adam Maleka", "Thembi Yvonne Masimini", "Zanele Nontobeko Ntuli", "Frank Mazibuko",
          "Thethani Sekele", "Shadrack Vusi Dhlamini", "John Horneys Maphakela", "Mduduzi Dennis Mgwenya", "Ipeleng Monchwe",
          "Barbara Matshepo Makiti", "Mancoba Mackdonald Sibiti", "Mokgadi Margaret Moakamela", "Asavela Xamba", "Thembisa Mgodeli",
          "Azile Ngxebe", "Thenjiwe Siwo", "Mandilakhe Maganda", "Hlokomelang Motsamayi", "Sabulela Thunzana",
          "Mikayla De Villiers", "Lindiwe Eunice Nikani", "Boitumelo Petunia Masango", "Marilyn Armoed", "Christopher Manjanja",
          "Siphiwe Prudence Nkosi", "Ayanda Emmanuel Mncube", "Sister Portia Jiana", "Ndibulele Vuke", "Kagiso Nkate",
          "NONHLANHLA HLATSHWAYO", "Nontuthuzelo Tracey Dyantyi", "Bongane Lourence Maseko", "Maphelo Galada", "Gontse Piet Botela",
          "Johannes Sibusiso Masango", "Zinhle Happiness Nxele", "Xolani Adams", "Darwood Groenewald", "Gerard Kolane",
          "Lucky Mlotshwa", "Ntombifuthi Msibi", "Amanda Tenge", "Raphaahle Reshoketjoe Maleka", "Sefako Reginald Makgatho",
          "Mositsane Abel Molefe", "Mavis Chauke", "Waleed Carolus", "Maria Molatelo Molekwa", "Desmond Selowa",
          "Mpho Gabriel Thipe", "Jimmy Sefularo Maila", "Collin Khavamba", "Musa Cliff Nyalungu", "Thandekile Mathumbu",
          "Sinethemba Nomdlange", "Jonathan Alfred Mathotho", "Kephas Rutava", "Hendrieta Mosibuda Mmola", "Tumelo Khanye",
          "Bafedile Mauwane", "Emily Nothesa Mathe", "Kgomotso Joy Maroga", "Rollen Didier Nembidzane", "Olefile Alfred Zwane",
          "Bolaku Elias Bogatsu", "Mpho Mosipidi Mashilo", "Yolelwa Shologu", "Daphney Maluleke", "Lucky Mashimbye",
          "Justice Thabo Nkosi", "Ziyanda Cobo", "Siphiwe Nombewu", "Sewela Conny Mamaila", "Doctor Patrick Motau",
          "Thomas Mhlongo", "Eddie Kamogelo Mahlangu", "Asisipho Hendricks", "Fusi Mofokeng", "Andile Spheka",
          "Sphamandla Shandu", "Phala William Tsamago", "Kamohelo Cyril Kolisang", "Ramatsobane Christinah Shebambo", "Lucy Kola",
          "Sinelizwi Sophaqa", "Cliff Maimela", "Mikea Khosa", "Thato Clifford Moleko", "Penuel Bonginkosi Mafuyeka",
          "Siphiwe Khaile", "Kedibone Eunice Moahlodi", "Amanda Gwili", "Raquel Marquard", "Puleng Bulani",
          "Thenjiwe Liwani", "Tebogo Tshabalala", "Christina Shibe Tshwane", "Nomthandazo Mazibuko", "Chevonne Reed",
          "Siyabonga Vilakazi", "Beauty Khosa", "Chriszolda Jansen", "Solomon Thomas Motau", "Dithomo Samson Zulu",
          "Bheki David Shongwe", "Victoria Rethabile Mmagopa", "Boitumelo Obed Chaba", "Rozanne Lotz", "Kgomotso Lovedelia Pitsi",
          "Vongani Mathebula", "Bonginkosi Ngcobo", "Shadrack Shoes Zwane", "Phomolo Tshopologe", "Promise Sithole",
          "Thandi Thonzi", "Julius Bles", "Mpho Paulinah Molefe", "Tariq Gouws", "Ntombenhle Sarah Motsoai",
          "Dwayne Booysen", "Lelethu Mpindela", "Nomawetu Sindelo", "Martha Settebaleng Makgongoana", "Nesethu Msongelwa",
          "Zinhle Monalisa Hlongwane", "Altricia Dikeledi Kotelo", "Zimkhitha Madubula", "Siphesihle Ronie Mtshali", "Doctor Elias Tsotetsi",
          "Thobane Ngcobo", "Amogelang Tong", "Tertia Dawids", "Mpho Tshabalala", "Lucia Mbatha",
          "Lydia Simake Mailola", "Sonia Monaunwa", "Nkululeko Nhlonipho Malevu", "Faith Zanele Tshabalala", "Jemaine Visagie",
          "Boitumelo Isabella Gcoyi", "Success Sihlangu", "Nonhlanhla Tembe", "Ali Jongqo", "Andriena Tshegofatso Setagane",
          "Moemedi Reigant Seimelo", "Mogase Walter Sekele", "Zanele Muriel Mbiko", "Smanga Wonderboy Mtshali", "Mahlako Jednar Mothapo",
          "Cabangile Nxumalo", "Katleho Ruth Sepolwane", "Noceba Gladys Nelani", "Lamukelo Ndlela", "Andisiwe Magadla",
          "Andisiwe Ncayiyana", "Luyanda Zondi", "Gugulethu Doctor Mdutyulwa", "Maria Dladla", "Mojabeng Mokgakala",
          "Mongi Madulwana", "Kgothatso Bridget Ntshabele", "Nonjabulo Makhunga", "Samukelisiwe Mchunu", "Silindile Meme",
          "Siyabonga Cyprian Sive", "Gugu Pertunia Mokoena", "Confidence Masuku", "Hloniphani Ngcobo", "Itani Sydney Mushaisano",
          "Minenhle Ntuthuko Mngomezulu", "Gabedi David Tsatsimpe", "Refilwe Elna Manjiya", "Barcelona Merimentsi", "Siyolise Ntoza",
          "Mmathapelo Annamarie Khanya", "Lungele Mtshali", "Funiwe Mana", "Amanda Simelane", "Nokuthula Mathe",
          "Utterly Utterly Sambo", "Kgakgamatso Mholo", "Nonjabulo Zethembiso Ntshangase", "Sipho Ngutshane", "Ephraim Goitsemodimo Moswele",
          "Matshidiso Phillepine Sekgodiso", "Reccado Pontsho Phalole", "James Molebalwa", "Emeltrudia Bonisile Mkhize", "Theto Lorraine Leshaba",
          "Kealeboga Vincent Monei", "Funokwakhe Titus Nyandeni", "Voile Mogau Malepe", "Lizzie Khoza", "Inocentia Morule",
          "Lithemba Sojola", "Qinisani Sphosethu Akhona Ngcobo", "Sinazo Mabho", "Patrick Pakkie Nkosi", "Fhatuwani Khorombi",
          "Busisiwe Siqhaza", "Celinhlanhla Trueman Ngcobo", "Ofhani Mildred Netshieneulu", "Mmamotlalo Annah Molepo", "Anikie Mawele",
          "Caiphus Mxolisi Sandleni", "Bongani Moses Nkosi", "Selby Mendisi Manzini", "Xolani Nzuza", "Thembinkosi Simon Mphephu",
          "Phumzile Ndlovu", "Muziovele Nkosi", "Nosiphiwo Kolisi", "Ayanda Maqa", "Ndaiki Rudeiba Vukela",
          "Agnes Mashava", "Nelisiwe Sibiya", "Sipho Khumalo", "Mmatleho Christina Mokhothu", "Minah Motsatsing",
          "Nicole Nonzwakazi Sango", "Molatelo Millicent Maja", "Lindokule Vusimuzi Kubheka", "Njunju Charmaine Nkuna", "James De Witt",
          "Moloko Phitus Tlhako", "Siphiwe Patrick Thoabala", "Louisa Nonqele Ngcebetsha", "Njabulo Victor Majola", "Kgothatso Maria Mabula",
          "Pholoso Mokhine Mokolo", "Thabo Moeletsi", "Beauty Tedile", "Clarisa Hendricks", "Mandla Msomi",
          "Rabia Meyer", "Asnath Manyelo", "Lucia Tendani Muthuhadini", "Deon P&G Brandt", "Khaphezakhe Andries Msiza",
          "Alfred Matjila", "Bevelon Moss", "Sphamandla Jeffrey Buthelezi", "Samuel Madimetsa Teffo", "Themba George Mazibuko",
          "Thabiso Innocent Buthelezi", "Rachael Lydia Moshewu", "Savuzwa Gqukani", "Sakhile Thokozani Gumede", "Nhlanhla Zulu",
          "Derrick Thami Mbambo", "Mojalefa Thorn Thulo", "Lesiba Johannes Monama", "Samuel Moitswadi Matlhatsi", "Sfiso Mazibuko",
          "Luyanda Nqobile Mngomezulu", "Xolani Nkosi", "Mandlakazi Radebe", "Mathilda Matsawela Maake", "Sanelisekile Gqotso",
          "Pumza Dyantyi", "Celumusa Mathobela", "Mafeta Jacqueline Maphoto", "Marina Tsholofelo Mabena", "Tebogo Morole",
          "Ofentse Singela", "Rapopang Nathaniel Ditshego", "Simphiwe Angel Mahlangu", "Thulani Phakamani Gumede", "Nkosinathi Ashley Baloyi",
          "Thandiwe Criselda Mathenjwa", "Herman Mfikwe", "Maureen Matshediso Ramabowa", "Mapula Lydia Mokganelwa", "Siyabonga Nhlumayo",
          "Olga Sawana", "Sebinani Margaret Kekana", "Kgalalelo Gloria Sebopelo", "Malito Nello Khoza", "Sheron Naledi Monareng",
          "Reynold Jood", "Funaziphi Mdlalose", "Khanyisile Morole", "Mduduzi Thulebona Njeke", "Sicelokuhle Jerome Mlotshwa",
          "Thembinkosi Lucas Mdletshe", "Sizakele Hazel Mtshali", "Nkosinathi Dlomo", "Nokuthula Nompilo Chiliza", "Boitumelo Patricia Serage",
          "Lehlotlo Segodi", "Ohilwe Welhemina Motsemonnye", "Quilinah Nelisile Mthimunye", "Thato Mogotsi", "Thabo Khumalo",
          "Benjamin Mosia", "Thembi Ndumo", "Modise John Sethebe", "Dowelani Joseph Munyai", "Manthadila Mokgampje Tladi",
          "Siphosethu Bunzima", "Edward Sipho Mahlangu", "Bathabile Yvonne Mahlangu", "Zinzi Awuwa", "Sophie Lebaka",
          "Zandile Khumalo", "Johanna Maile", "Lucas Makhubela", "Phindile Portia Mohlala", "Lebohang Frank Mojapelo",
          "Peter Thajane", "Monique Petersen", "Trevor Thabo Fikeni", "Le-One Willems", "Khombisile Gumede",
          "Sinethemba Ntlawuzana", "Siyabonga Dlamini", "Zithulele Patrick Mvundla", "Indiphile Sodladla", "Mncedisi Bottomani",
          "Lusanda Ngcuka", "Yolisa Lucando", "Mayenziwe Mkulisi", "Caswell Matee Matlonya", "Jaicom Nkuna",
          "Maboko Johannes Thuto", "Thabang Lehlohonolo Sibaya", "Sherwin Thomas", "Emmanuel Bheki Mbata", "Moegamat Tasleem Elliott",
          "Ekageng Rooi Majadibodu", "Thubalakhe Sonti", "Bongani Meshack Msibi", "Babalwa Ben", "Nolubabalo Booi",
          "Sandile Wiseman Zulu", "Stevens Viljoen", "Lucky Khoza", "Sindo Zuma", "Johannes Magetle Mutuku",
          "Malebogo Moitoi", "Avhentinah Ngobeni", "Frans Ndumandi", "Boitumelo Maruping", "Kabelo Moses Setuki",
          "Mohale Dennis Malatji", "Lindokuhle Kunene", "Veronica Tyakume", "Azwihangwisi Freedom Ndou", "Siphelo Yaliwe",
          "Thulani Arnold Sithole", "Eulander Mashigo", "Malebo Cynthia Moloto", "Bonginkosi Aaron Khoza", "Nkululeko Ngubane",
          "Aamir Samodien", "Itumeleng Ashley Moumakwe", "Titus Zondi Mngomezulu", "Clishman Chiloane", "Maanda Rosinah Denga",
          "Mmatsholo Olga Ramalatsi", "Vuyiswa Sifumba", "Tebogo Aaron Mashego", "Nomusa Zodwa Zondo", "Siqinisile Cebolozakha Zulu",
          "Mthobisi Raymond Khumalo", "Lindeka Sitshisa", "Qinisela Ngidli", "Sarah Ouma Hlatshwayo", "Sipho Donald Masalesa",
          "Ntombifikile Masiza", "Nosiviwe Tsangela", "Ndivhuwo Gumani", "Anele Princess Mkhize", "Lisa Tau",
          "Anele Mthembu", "Bhekinkosi Vincent Nkosi", "Nthabiseng Florence Tinane", "Ntombi Iris Khumalo", "Khayalethu Saki",
          "Tebogo Joel Loeto", "Nontokozo Precious Magubane", "Thabisile Myeza", "Banele Njabulo Masilela", "Neo Gerald Moreti",
          "Mpumelelo Handsome Sibiya", "Waseema Davis", "Amogelang Gopane", "Enver Winston Michaels", "Morne Swarts",
          "Tshepo Gift Jeremia Busa", "Nonhlanhla Dindi", "Lerato Letsholonyane", "Karabo Elvis Seruthu", "Samuel Sipho Xaba",
          "Mary Neo Motumi", "Jabu Simon Mthimunye", "Mthuthuzelo Bulelani Nongauza", "Nazeem Cassim", "Lesetja Charles Modiba",
          "Hilton Mbokazi", "Frans Addy Masemola", "Agisanang Khutsoane", "Daniswa Manekwana", "Katlego Theo Pako",
          "Teboho Mofokeng", "Claudelle Gomis", "Tumi Michael Gopane", "BRANWIN MAASDORP", "SABELO MKHONZA",
          "JENNIFER SEBOKO", "MAXZANE HENDRICKS", "CURWIN FRANCIS", "FERREL TARANTAAL", "PHILLIDENE PINTO",
          "ASHTON DAMON", "REAGAN PASQUALLI", "LINDSAY SPYERS", "ANUSHKA LOMBAARD",
        ];
        const newSetUp = new Set(NEW_LIST.map(n => n.trim().toUpperCase()));
        const currentReps = await db3.execute(sql3`SELECT rep_name, active FROM pilot_reps`);
        const currentRowsUp = currentReps.rows as any[];
        const currentSetUp = new Set(currentRowsUp.map(r => String(r.rep_name).trim().toUpperCase()));
        const toDeactivateUp = currentRowsUp.filter(r => !newSetUp.has(String(r.rep_name).trim().toUpperCase()) && r.active).map(r => r.rep_name);
        const toAddUp = [...newSetUp].filter(n => !currentSetUp.has(n));
        const toReactivateUp = currentRowsUp.filter(r => newSetUp.has(String(r.rep_name).trim().toUpperCase()) && !r.active).map(r => r.rep_name);
        for (const name of toDeactivateUp) {
          await db3.execute(sql3`UPDATE pilot_reps SET active = false, left_date = '2026-07-22' WHERE UPPER(TRIM(rep_name)) = ${name.trim().toUpperCase()}`);
        }
        for (const name of NEW_LIST.filter(n => toAddUp.includes(n.trim().toUpperCase()))) {
          await db3.execute(sql3`INSERT INTO pilot_reps (rep_name, joined_date, active) VALUES (${name.trim()}, '2026-07-22', true) ON CONFLICT (rep_name) DO NOTHING`);
        }
        for (const name of toReactivateUp) {
          await db3.execute(sql3`UPDATE pilot_reps SET active = true, left_date = NULL WHERE UPPER(TRIM(rep_name)) = ${name.trim().toUpperCase()}`);
        }
        console.log(`[STARTUP SCRIPT] Pilot rep sync complete — deactivated: ${toDeactivateUp.length}, added: ${toAddUp.length}, reactivated: ${toReactivateUp.length}`);
      } catch (err) {
        console.error('[STARTUP SCRIPT] Pilot rep sync error:', err);
      }
    },
  );
})();
