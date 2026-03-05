const http = require('http');
require('dns').setServers(['8.8.8.8', '1.1.1.1']);

const { MongoClient } = require('mongodb');
const { ObjectId } = require('mongodb');


const uri = "mongodb+srv://samsadmin:sams123456@samsystem-cluster.qxrdgil.mongodb.net/samsystem?retryWrites=true&w=majority";

let db;

// ✅ Add at top of server.js (after requires)
const sessions = new Map();
function parseCookies(req) {
  const cookies = req.headers.cookie ? req.headers.cookie.split(';') : [];
  for (let cookie of cookies) {
    const eqPos = cookie.indexOf('=');
    const name = cookie.substr(0, eqPos).trim();
    const value = cookie.substr(eqPos + 1).trim();
    if (name === 'sams_sid') return value;
  }
  return null;
}


function getSession(req, res) {
  // Simple in-memory session (upgrade to Redis later)
  const cookieHeader = req.headers.cookie;
  let sessionId = cookieHeader ? cookieHeader.match(/sams_sid=([^;]+)/)?.[1] : null;
  
  if (!sessionId || !sessions.has(sessionId)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Session expired' }));
    return null;
  }
  
  return sessions.get(sessionId);
}

/* ===============================
   CONNECT TO MONGODB
================================ */
MongoClient.connect(uri)
  .then(client => {
    db = client.db('samsystem');
    console.log('✅ MongoDB Connected!');
    seedData();
  })
  .catch(err => console.error('❌ MongoDB Error:', err));


/* ===============================
   BODY PARSER (Reusable)
================================ */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", err => reject(err));
  });
}

/* ===============================
   SEED DATA
================================ */
async function seedData() {

  const academyId = "ACAD001";

  await db.collection('users').updateOne(
    { username: 'acaduser' },
    {
      $setOnInsert: {
        username: 'acaduser',
        password: 'pass',
        role: 'academy',
        academyId: academyId,
        createdAt: new Date()
      }
    },
    { upsert: true }
  );

  await db.collection('academies').updateOne(
    { _id: academyId },
    {
      $setOnInsert: {
        _id: academyId,
        name: 'Pune City FC',
        manager: 'acaduser',
        address: 'Pune, Maharashtra',
        createdAt: new Date()
      }
    },
    { upsert: true }
  );

  console.log('✅ SEED COMPLETE (acaduser/pass)');
}

/* ===============================
   SERVER
================================ */
const server = http.createServer(async (req, res) => {

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, academyId');
  res.setHeader('Content-Type', 'application/json');

  // Handle Preflight Request
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  let academyId;

try {

  // ✅ FIXED: Handle both PascalCase AND lowercase headers
  academyId = req.headers['academyId'] || req.headers['academyid'];

  // Define public routes (NO academyId required)
  const publicRoutes = [

  '/api/auth/login',
  '/api/auth/register',
  '/api/academies',
  '/api/student/dashboard',
  '/api/student/fees',
  '/api/student/attendance'
];

// Remove query parameters
const cleanUrl = req.url.split('?')[0];

// Protect only academy management routes
const academyProtected = cleanUrl.startsWith('/api/academy');

// Block academy routes if academyId header missing
if (academyProtected && !academyId) {
  res.writeHead(401, { "Content-Type": "application/json" });
  return res.end(JSON.stringify({
    success: false,
    message: "Academy ID missing"
  }));

}

  } catch (err) {

    console.error("Request header error:", err);

    res.writeHead(500, { "Content-Type": "application/json" });

    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
  
 
  /* ===============================
     YOUR ROUTES CONTINUE BELOW
  ================================= */
/* ===============================
   HOME
================================ */
if (req.url === '/' && req.method === 'GET') {

  res.writeHead(200);

  return res.end(JSON.stringify({
    success: true,
    message: "SAM SYSTEM Backend LIVE 🚀",
    version: "1.0",
    endpoints: [
      "POST /api/auth/login",
      "POST /api/auth/register",
      "GET /api/students",
      "POST /api/students",
      "PUT /api/students/:id",
      "DELETE /api/students/:id",
      "GET /api/coaches",
      "POST /api/coaches",
      "GET /api/fees",
      "POST /api/fees",
      "POST /api/attendance",
      "GET /api/academy/stats"
    ]
  }));

}
/* =============================== LOGIN (SESSION FIXED) ================================= */
if (req.url === '/api/auth/login' && req.method === 'POST') {
  try {
    const { username, password } = await parseBody(req);

    if (!username || !password) {
      res.writeHead(400);
      return res.end(JSON.stringify({
        success: false,
        message: "Username and password required"
      }));
    }

    const user = await db.collection('users').findOne({ username });

    if (!user || user.password !== password) {
      res.writeHead(401);
      return res.end(JSON.stringify({
        success: false,
        message: "Invalid username or password"
      }));
    }

    const academy = await db.collection('academies')
      .findOne({ _id: user.academyId });

    // ✅ STEP 4A: CREATE SESSION
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    sessions.set(sessionId, {
      user: {
        username: user.username,
        role: user.role,
        academyId: user.academyId,
        studentId: user.studentId || null  // ✅ Include studentId
      },
      expires: Date.now() + 24 * 60 * 60 * 1000, // 24h
      academy: academy
    });

    // ✅ STEP 4B: SET SESSION COOKIE
    res.setHeader('Set-Cookie', `sams_sid=${sessionId}; Max-Age=86400; HttpOnly; Path=/`);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });

    return res.end(JSON.stringify({
      success: true,
      user: {
        username: user.username,
        role: user.role,
        academyId: user.academyId,
        studentId: user.studentId || null  // ✅ Frontend expects this
      },
      academy: academy
    }));

  } catch (error) {
    console.error("Login Error:", error);
    res.writeHead(500);
    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
}

	
/* ===============================    REGISTER ================================ */
if (req.url === '/api/auth/register' && req.method === 'POST') {
  try {
    const data = await parseBody(req);
    const {
      firstName,
      lastName,
      email,
      password,
      role,
      sport,
      phone,
      academyId
    } = data;

    // Required fields check
    if (!firstName || !lastName || !email || !password || !role) {
      res.writeHead(400);
      return res.end(JSON.stringify({
        success: false,
        message: "Missing required fields"
      }));
    }

    // Check if email already exists
    const emailExists = await db.collection('users').findOne({ email });
    if (emailExists) {
      res.writeHead(409);
      return res.end(JSON.stringify({
        success: false,
        message: "Email already registered"
      }));
    }

    // Generate username
    let username = (firstName.substring(0,3) + lastName.substring(0,3) + Math.floor(Math.random()*100)).toLowerCase();
    while (await db.collection('users').findOne({ username })) {
      username = username + Math.floor(Math.random()*9);
    }

    // Determine academyId
    let academyIdGenerated = academyId || null;

    // If academy registers → create academy
    if (role === 'academy') {
      academyIdGenerated = 'ACAD' + Date.now().toString().slice(-6);
      await db.collection('academies').insertOne({
        _id: academyIdGenerated,
        name: data.academyName || "New Academy",
        manager: username,
        city: data.city || "",
        state: data.state || "",
        createdAt: new Date()
      });
    }

    // If role is student → create student first (linked)
    let studentIdGenerated = null;
    if (role === "student") {
      // Generate studentId
      studentIdGenerated = 'STU' + Date.now().toString().slice(-6);

      // Check if contact already exists
      if (phone) {
        const existingContact = await db.collection('students').findOne({ contact: phone });
        if (existingContact) {
          res.writeHead(400);
          return res.end(JSON.stringify({
            success: false,
            message: "Contact number already exists"
          }));
        }
      }

      // Insert student
      await db.collection('students').insertOne({
        _id: studentIdGenerated,
        name: firstName + " " + lastName,
        sport: sport || "",
        age: data.age || "",
        batch: data.batch || "",
        contact: phone || "",
        email: email,
        academyId: academyIdGenerated,
        createdAt: new Date()
      });
    }

    // Create user (linked if student)
    await db.collection('users').insertOne({
      username,
      email,
      password, // Keep original password from register
      role,
      academyId: academyIdGenerated,
      studentId: studentIdGenerated, // 🔥 Automatically linked if student
      createdAt: new Date()
    });

    res.writeHead(200);
    return res.end(JSON.stringify({
      success: true,
      message: "User registered successfully",
      username,
      academyId: academyIdGenerated,
      studentId: studentIdGenerated || null
    }));

  } catch (error) {
    console.error("Register Error:", error);
    res.writeHead(500);
    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
}
/* ===============================
   GET ALL ACADEMIES (PUBLIC)
================================ */
if (req.url === '/api/academies' && req.method === 'GET') {

  try {

    const academies = await db.collection('academies')
      .find({})
      .project({ _id: 1, name: 1 })
      .toArray();

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(academies));

  } catch (error) {

    console.error("Get Academies Error:", error);

    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));

  }
}

/* ===============================
   GET STUDENTS BY ACADEMY
================================ */
if (req.url.startsWith('/api/students/') && req.method === 'GET') {

  const academyId = req.url.split('/').pop();

  try {

    const students = await db.collection('students')
    .find({ academyId })
    .toArray();

    res.writeHead(200);
    return res.end(JSON.stringify({
      success:true,
      students
    }));

  } catch(err){

    res.writeHead(500);
    return res.end(JSON.stringify({
      success:false
    }));

  }
}

/* ===============================
   GET ACADEMY BY ID
================================ */
if (req.url.startsWith('/api/academy/') && req.method === 'GET') {

  const academyId = req.url.split('/').pop();

  try {

    const academy = await db.collection('academies').findOne({ _id: academyId });

    if (!academy) {
      res.writeHead(404);
      return res.end(JSON.stringify({
        success: false,
        message: "Academy not found"
      }));
    }

    res.writeHead(200);
    return res.end(JSON.stringify({
      success: true,
      academy
    }));

  } catch (err) {

    res.writeHead(500);
    return res.end(JSON.stringify({
      success:false,
      message:"Server error"
    }));

  }
}


/* ===============================
   GET STUDENTS
================================ */
if (req.url === '/api/students' && req.method === 'GET') {

  try {

    // Ensure academyId exists
    if (!academyId) {
      res.writeHead(401);
      return res.end(JSON.stringify({
        success: false,
        message: "Academy ID missing"
      }));
    }

    const students = await db.collection('students')
      .find({ academyId: academyId })
      .toArray();

    res.writeHead(200);

    return res.end(JSON.stringify({
      success: true,
      students
    }));

  } catch (error) {

    console.error("Get Students Error:", error);

    res.writeHead(500);

    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));

  }
}

/* ===============================  
   GET ALL STUDENTS (PUBLIC - VISITOR USE)
================================ */
if (req.url === '/api/students/public' && req.method === 'GET') {
  try {
    const students = await db.collection('students')
      .find({})
      .project({ 
        name: 1, 
        age: 1, 
        sport: 1, 
        batch: 1, 
        contact: 1, 
        academyId: 1, 
        parent: 1,
        _id: 1 
      })
      .toArray();

    res.writeHead(200);
    return res.end(JSON.stringify({
      success: true,
      students
    }));

  } catch (error) {
    console.error("Get Public Students Error:", error);
    res.writeHead(500);
    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
}

/* ===============================  
   GET STUDENTS BY ACADEMY (PUBLIC)
================================ */
if (req.url.startsWith('/api/students/public/') && req.method === 'GET') {
  try {
    const academyId = req.url.split('/').pop();
    
    const students = await db.collection('students')
      .find({ academyId: academyId })
      .project({ name: 1, age: 1, sport: 1, batch: 1, contact: 1, parent: 1, _id: 1 })
      .toArray();

    res.writeHead(200);
    return res.end(JSON.stringify({
      success: true,
      students
    }));

  } catch (error) {
    res.writeHead(500);
    return res.end(JSON.stringify({ success: false }));
  }
}


/* ===============================
   ADD STUDENT (WITH LOGIN + EMAIL)
================================ */
if (req.url === '/api/students' && req.method === 'POST') {

  try {

    if (!academyId) {
      res.writeHead(401);
      return res.end(JSON.stringify({
        success: false,
        message: "Academy ID missing"
      }));
    }

    const data = await parseBody(req);

    if (!data.name || !data.sport || !data.contact || !data.email) {
      res.writeHead(400);
      return res.end(JSON.stringify({
        success: false,
        message: "Name, sport, contact and email are required"
      }));
    }

    /* ============================
       GENERATE STUDENT ID
    ============================ */
    const studentId = 'STU' + Date.now().toString().slice(-6);

    /* ============================
       GENERATE USERNAME (SAME AS REGISTER)
    ============================ */
    const nameParts = data.name.trim().split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts[1] || "";

    let username =
      (firstName.substring(0,3) +
       lastName.substring(0,3) +
       Math.floor(Math.random()*100)
      ).toLowerCase();

    // Ensure username is unique
    while (await db.collection('users').findOne({ username })) {
      username =
        username +
        Math.floor(Math.random()*9);
    }

    /* ============================
       CHECK EMAIL & CONTACT DUPLICATE
    ============================ */
    const existingEmail = await db.collection('users').findOne({ email: data.email });
    if (existingEmail) {
      res.writeHead(400);
      return res.end(JSON.stringify({
        success: false,
        message: "Email already registered"
      }));
    }

    const existingContact = await db.collection('students').findOne({ contact: data.contact });
    if (existingContact) {
      res.writeHead(400);
      return res.end(JSON.stringify({
        success: false,
        message: "Contact number already exists"
      }));
    }

    const tempPassword = "123456";

    /* ============================
       INSERT STUDENT
    ============================ */
    const newStudent = {
      _id: studentId,
      name: data.name,
      age: data.age || "",
      sport: data.sport,
      batch: data.batch || "",
      contact: data.contact,
      email: data.email,
      academyId: academyId,
      createdAt: new Date()
    };

    await db.collection('students').insertOne(newStudent);

    try {

      /* ============================
         INSERT LINKED USER
      ============================ */
      await db.collection('users').insertOne({
        username,
        email: data.email,
        password: tempPassword,
        role: "student",
        academyId,
        studentId,
        createdAt: new Date()
      });

    } catch (err) {

      // Rollback student if user insert fails
      await db.collection('students').deleteOne({ _id: studentId });
      throw err;
    }

    res.writeHead(200);

    return res.end(JSON.stringify({
      success: true,
      message: "Student and login created successfully",
      student: newStudent,
      username,
      tempPassword
    }));

  } catch (error) {

    console.error("Add Student Error:", error);

    res.writeHead(500);

    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));

  }
}

/* ===============================
   UPDATE STUDENT
================================ */
if (req.method === 'PUT' && req.url.startsWith('/api/students/')) {

  try {

    if (!academyId) {
      res.writeHead(401);
      return res.end(JSON.stringify({
        success: false,
        message: "Academy ID missing"
      }));
    }

    const parts = req.url.split('/');
    const studentId = parts[parts.length - 1];

    const updatedData = await parseBody(req);

    const result = await db.collection('students').updateOne(
      { _id: studentId, academyId: academyId },
      { $set: updatedData }
    );

    if (result.matchedCount === 0) {
      res.writeHead(404);
      return res.end(JSON.stringify({
        success: false,
        message: "Student not found"
      }));
    }

    res.writeHead(200);

    return res.end(JSON.stringify({
      success: true,
      message: "Student updated successfully"
    }));

  } catch (error) {

    console.error("Update Student Error:", error);

    res.writeHead(500);

    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));

  }
}

/* ===============================
   DELETE STUDENT
================================ */
if (req.url.startsWith('/api/students/') && req.method === 'DELETE') {

  try {

    if (!academyId) {
      res.writeHead(401);
      return res.end(JSON.stringify({
        success: false,
        message: "Academy ID missing"
      }));
    }

    const parts = req.url.split('/');
    const studentId = parts[parts.length - 1];

    const result = await db.collection('students').deleteOne({
      _id: studentId,
      academyId: academyId
    });

    if (result.deletedCount === 0) {
      res.writeHead(404);
      return res.end(JSON.stringify({
        success: false,
        message: "Student not found"
      }));
    }

    res.writeHead(200);

    return res.end(JSON.stringify({
      success: true,
      message: "Student deleted successfully"
    }));

  } catch (error) {

    console.error("Delete Student Error:", error);

    res.writeHead(500);

    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));

  }
}

/* ===============================
   GET COACHES
================================ */
if (req.url === '/api/coaches' && req.method === 'GET') {

  try {

    if (!academyId) {
      res.writeHead(401);
      return res.end(JSON.stringify({
        success: false,
        message: "Academy ID missing"
      }));
    }

    const coaches = await db.collection('coaches')
      .find({ academyId: academyId })
      .toArray();

    res.writeHead(200);

    return res.end(JSON.stringify({
      success: true,
      coaches: coaches
    }));

  } catch (error) {

    console.error("Get Coaches Error:", error);

    res.writeHead(500);

    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));

  }
}
	


    /* ===============================
   ADD COACH
================================ */
if (req.url === '/api/coaches' && req.method === 'POST') {

  const data = await parseBody(req);

  const newCoach = {
    _id: 'COA' + Date.now().toString().slice(-6),
    name: data.name,
    sport: data.sport,
    experience: data.experience,
    contact: data.contact,
    academyId: academyId,
    createdAt: new Date()
  };

  await db.collection('coaches').insertOne(newCoach);

  return res.end(JSON.stringify({
    success: true,
    coach: newCoach
  }));
}

/* ===============================
   UPDATE COACH
================================ */
if (req.method === 'PUT' && req.url.startsWith('/api/coaches/')) {
  try {
    if (!academyId) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Academy ID missing"
      }));
    }

    const parts = req.url.split('/');
    const coachId = parts[parts.length - 1];

    // Find coach as string ID
    const updatedData = await parseBody(req);

    const result = await db.collection('coaches').updateOne(
      { _id: coachId, academyId: academyId },
      { $set: updatedData }
    );

    if (result.matchedCount === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Coach not found"
      }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: true,
      message: "Coach updated successfully"
    }));

  } catch (error) {
    console.error("Update Coach Error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
}

if (req.url.startsWith('/api/coaches/') && req.method === 'DELETE') {

  try {

    const parts = req.url.split('/');
    const coachId = parts[parts.length - 1];

    const result = await db.collection('coaches').deleteOne({
      _id: coachId,
      academyId: academyId
    });

    if (result.deletedCount === 0) {
      res.writeHead(404);
      return res.end(JSON.stringify({
        success: false,
        message: "Coach not found"
      }));
    }

    res.writeHead(200);
    return res.end(JSON.stringify({
      success: true,
      message: "Coach deleted successfully"
    }));

  } catch (error) {
    console.error("Delete Coach Error:", error);
    res.writeHead(500);
    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
}
   
/* ======================================
   ACADEMY DASHBOARD STATS - FIXED
====================================== */
if (req.url === '/api/academy/stats' && req.method === 'GET') {
  const academyId = req.headers['academyid'] || req.headers['academyId'];
  
  if (!academyId) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Academy ID missing"
    }));
  }

  try {
    // ✅ FIX 1: Use {id: academyId} not {_id}
    const academy = await db.collection('academies')
      .findOne({ id: academyId });

    const totalStudents = await db.collection('students')
      .countDocuments({ academyId: academyId });

    const totalCoaches = await db.collection('coaches')
      .countDocuments({ academyId: academyId });

    const pendingFeesRecords = await db.collection('fees')
      .find({ academyId: academyId, status: 'Pending' })
      .toArray();

    const pendingAmount = pendingFeesRecords.reduce((sum, fee) => {
      return sum + (Number(fee.amount) || 0);
    }, 0);

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: true,
      stats: {
        academyName: academy ? academy.name : "Academy",
        totalStudents: totalStudents,
        activeCoaches: totalCoaches,
        attendanceRate: "98%",
        pendingFees: "₹" + pendingAmount.toLocaleString()
      }
    }));

  } catch (error) {
    console.error("Stats API Error:", error);
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Server error: " + error.message
    }));
  }
}


/* =================================
   STUDENT DASHBOARD (USING studentId)
================================= */
if (req.method === "GET" && req.url.startsWith("/api/student/dashboard")) {

  try {

    const url = new URL(req.url, `http://${req.headers.host}`);
    const academyIdQuery = url.searchParams.get("academyId");
    const studentIdQuery = url.searchParams.get("studentId");

    if (!academyIdQuery || !studentIdQuery) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "academyId and studentId required"
      }));
    }

    // Fetch student using studentId + academyId
    const student = await db.collection("students")
      .findOne({ _id: studentIdQuery, academyId: academyIdQuery });

    if (!student) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Student not found"
      }));
    }

    const academy = await db.collection("academies")
      .findOne({ _id: academyIdQuery });

    res.writeHead(200, { "Content-Type": "application/json" });

    return res.end(JSON.stringify({
      success: true,
      student,
      academy
    }));

  } catch (err) {

    console.error("Student Dashboard Error:", err);

    res.writeHead(500, { "Content-Type": "application/json" });

    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
}
/* ===============================
   STUDENT FEES academy_DASHBOARD
================================ */
if (req.method === "GET" && req.url.startsWith("/api/student/fees")) {

  try {

    const url = new URL(req.url, `http://${req.headers.host}`);
    const studentId = url.searchParams.get("studentId");
    const academyIdQuery = url.searchParams.get("academyId");
    const year = Number(url.searchParams.get("year"));

    const fees = await db.collection("fees")
      .find({
        studentId: studentId,
        academyId: academyIdQuery,
        year: year
      })
      .sort({ month: 1 })
      .toArray();

    const formatted = fees.map(f => ({
      month: f.month,
      amount: f.amount,
      status: f.status || "Pending",
      paidDate: f.paidDate ? new Date(f.paidDate).toISOString().split("T")[0] : null
    }));

    res.writeHead(200);
    return res.end(JSON.stringify(formatted));

  } catch (err) {

    console.error("Fees API Error:", err);

    res.writeHead(500);
    return res.end(JSON.stringify([]));
  }
}

/* ===============================
   STUDENT ATTENDANCE academy_DASHBOARD
================================ */
if (req.method === "GET" && req.url.startsWith("/api/student/attendance")) {

  try {

    const url = new URL(req.url, `http://${req.headers.host}`);
    const studentId = url.searchParams.get("studentId");
    const academyIdQuery = url.searchParams.get("academyId");
    const month = Number(url.searchParams.get("month"));
    const year = Number(url.searchParams.get("year"));

    const start = `${year}-${String(month).padStart(2,'0')}-01`;
    const end = `${year}-${String(month).padStart(2,'0')}-31`;

    const docs = await db.collection("attendance")
      .find({
        academyId: academyIdQuery,
        date: { $gte: start, $lte: end }
      })
      .sort({ date: 1 })
      .toArray();

    const records = [];

    docs.forEach(doc => {

      const studentRecord = doc.records.find(r => r.studentId === studentId);

      if (studentRecord) {
        records.push({
          date: doc.date,
          status: studentRecord.status
        });
      }

    });

    res.writeHead(200);
    return res.end(JSON.stringify(records));

  } catch (err) {

    console.error("Attendance API Error:", err);

    res.writeHead(500);
    return res.end(JSON.stringify([]));
  }
}

/* ===============================
   UPDATE ACADEMY PROFILE
================================ */
if (req.method === "PUT" && req.url === "/api/academy/update-profile") {

  try {

    const academyId = (req.headers["academyid"] || "").trim();

    if (!academyId) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Academy ID missing"
      }));
    }

    const body = await parseBody(req);
    const { field, value } = body;

    if (!field || typeof value !== "string" || !value.trim()) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Field and valid value required"
      }));
    }

    const allowedFields = ["name", "manager"];

    if (!allowedFields.includes(field)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Invalid field"
      }));
    }

    const result = await db.collection("academies").updateOne(
      { _id: academyId },
      {
        $set: {
          [field]: value.trim(),
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Academy not found"
      }));
    }

    res.writeHead(200, { "Content-Type": "application/json" });

    return res.end(JSON.stringify({
      success: true,
      message: "Profile updated successfully"
    }));

  } catch (err) {

    console.error("Update Academy Profile Error:", err);

    res.writeHead(500, { "Content-Type": "application/json" });

    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
}

/* ===============================
   STUDENT FEES
================================ */

if (req.url.startsWith('/api/student/fees') && req.method === 'GET') {

  const url = new URL(req.url, `http://${req.headers.host}`);

  const academyId = url.searchParams.get("academyId");
  const studentId = url.searchParams.get("studentId");
  const year = parseInt(url.searchParams.get("year"));

  try {

    const fees = await db.collection("fees").find({
      academyId,
      studentId,
      year
    }).toArray();

    res.writeHead(200);
    return res.end(JSON.stringify(fees));

  } catch(err) {

    console.error(err);

    res.writeHead(500);
    return res.end(JSON.stringify([]));

  }

}

// ===============================
// FEES API - GET
// ===============================
if (req.method === "GET" && req.url.startsWith("/api/fees")) {

  // Check academyId from headers
  if (!academyId) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Academy ID missing"
    }));
  }

  try {
    // Parse query parameters for month and year
    const url = new URL(req.url, `http://${req.headers.host}`);
    const month = url.searchParams.get("month");
    const year = url.searchParams.get("year");

    let filter = { academyId: academyId };

    if (month) filter.month = Number(month);
    if (year) filter.year = Number(year);

    // Fetch fees from database
    const feesRecords = await db.collection("fees")
      .find(filter)
      .toArray();

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: true,
      fees: feesRecords
    }));

  } catch (err) {
    console.error("Fees GET Error:", err);

    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
}

// ===============================
// FEES API - POST (Add / Update Fee)
// ===============================
if (req.method === "POST" && req.url === "/api/fees") {

  // Check academyId from headers
  if (!academyId) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Academy ID missing"
    }));
  }

  try {
    const body = await parseBody(req);

    // Validate required fields
    const { studentId, month, year, amount, status, dueDate } = body;
    if (!studentId || !month || !year) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Missing required fields: studentId, month, or year"
      }));
    }

    const paidDate = status === "Paid" ? new Date() : null;

    // Upsert fee record
    await db.collection("fees").updateOne(
      {
        studentId: studentId,
        month: Number(month),
        year: Number(year),
        academyId: academyId
      },
      {
        $set: {
          studentId: studentId,
          month: Number(month),
          year: Number(year),
          amount: Number(amount || 0),
          status: status || "Pending",
          dueDate: dueDate || "",
          paidDate: paidDate,
          academyId: academyId,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: true,
      message: "Fee updated successfully"
    }));

  } catch (err) {
    console.error("Fees POST Error:", err);

    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
}

/* ===============================
   ATTENDANCE API - SINGLE DATE GET
// ================================ */
if (req.method === "GET" && req.url.startsWith("/api/attendance?")) {

  if (!academyId) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Academy ID missing"
    }));
  }

  try {

    const url = new URL(req.url, `http://${req.headers.host}`);
    const date = url.searchParams.get("date");

    if (!date) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Date required"
      }));
    }

    const doc = await db.collection("attendance").findOne({
      academyId: academyId,
      date: date
    });

    let attendance = [];

    if (doc) {
      doc.records.forEach(r => {
        attendance.push({
          studentId: r.studentId,
          status: r.status,
          date: doc.date
        });
      });
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: true,
      attendance
    }));

  } catch (err) {

    console.error("Single Attendance Error:", err);

    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
}

/* ===============================
   ATTENDANCE API - POST (FIXED)
================================ */
if (req.url === '/api/attendance' && req.method === 'POST') {

  if (!academyId) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Academy ID missing"
    }));
  }

  try {

    const { date, records } = await parseBody(req);

    if (!date || !records || !Array.isArray(records) || records.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Invalid attendance data"
      }));
    }

    // 🔥 REPLACE insertOne WITH updateOne + upsert
    await db.collection("attendance").updateOne(
      {
        academyId: academyId,
        date: date
      },
      {
        $set: {
          academyId: academyId,
          date: date,
          records: records,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: true,
      message: "Attendance saved successfully"
    }));

  } catch (err) {

    console.error("Attendance POST Error:", err);

    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
}

/* ===============================
   STUDENT ATTENDANCE
================================ */

if (req.url.startsWith('/api/student/attendance') && req.method === 'GET') {

  const url = new URL(req.url, `http://${req.headers.host}`);

  const academyId = url.searchParams.get("academyId");
  const studentId = url.searchParams.get("studentId");
  const month = parseInt(url.searchParams.get("month"));
  const year = parseInt(url.searchParams.get("year"));

  try {

    const records = await db.collection("attendance").find({
      academyId
    }).toArray();

    const studentAttendance = [];

    records.forEach(day => {

      const date = new Date(day.date);

      if (date.getMonth()+1 === month && date.getFullYear() === year) {

        const student = day.records.find(r => r.studentId === studentId);

        if (student) {
          studentAttendance.push({
            date: day.date,
            status: student.status
          });
        }

      }

    });

    res.writeHead(200);
    return res.end(JSON.stringify(studentAttendance));

  } catch(err) {

    console.error(err);

    res.writeHead(500);
    return res.end(JSON.stringify([]));

  }

}

/* ===============================
   ATTENDANCE API - MONTHLY GET
================================ */
if (req.method === "GET" && req.url.startsWith("/api/attendance/monthly")) {

  if (!academyId) {
    res.writeHead(401, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Academy ID missing"
    }));
  }

  try {

    const url = new URL(req.url, `http://${req.headers.host}`);
    const year = Number(url.searchParams.get("year"));
    const month = Number(url.searchParams.get("month")); // 1-12

    if (!year || !month) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({
        success: false,
        message: "Year and month required"
      }));
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Fetch attendance documents for that month
    const monthlyDocs = await db.collection("attendance")
      .find({
        academyId: academyId,
        date: {
          $gte: startDate.toISOString().split("T")[0],
          $lte: endDate.toISOString().split("T")[0]
        }
      })
      .toArray();

    // Flatten records into simple array
    let attendance = [];

    monthlyDocs.forEach(doc => {
      doc.records.forEach(r => {
        attendance.push({
          studentId: r.studentId,
          status: r.status,
          date: doc.date
        });
      });
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: true,
      attendance
    }));

  } catch (err) {

    console.error("Monthly Attendance Error:", err);

    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      success: false,
      message: "Server error"
    }));
  }
  
  
}

});

server.listen(5000, () => {
  console.log("🚀 SAM SYSTEM Backend LIVE");
  console.log("🌐 Server running at: http://localhost:5000");
});