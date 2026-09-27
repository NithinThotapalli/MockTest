import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import jwt from 'jsonwebtoken';
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.MONGODB_DB || 'assessly';
const jwtSecret = process.env.JWT_SECRET || 'development-only-change-me';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
let db;
let dbPromise;

app.use(express.json());
app.use(express.static(__dirname));
async function connectDatabase() {
  if (!dbPromise) dbPromise = client.connect().then(async () => { db = client.db(dbName); await seed(); return db; });
  return dbPromise;
}
app.use(async (req, res, next) => {
  try { await connectDatabase(); next(); } catch (error) { res.status(503).json({ error: 'Database unavailable' }); }
});

function publicUser(user) { return { id: user._id.toString(), username: user.username, name: user.name, role: user.role }; }
function signToken(user) { return jwt.sign({ id: user._id.toString(), role: user.role }, jwtSecret, { expiresIn: '8h' }); }
function requireAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    req.auth = jwt.verify(token, jwtSecret);
    next();
  } catch { res.status(401).json({ error: 'Authentication required' }); }
}
function requireRole(role) { return (req, res, next) => req.auth.role === role ? next() : res.status(403).json({ error: 'Access denied' }); }

app.post('/api/auth/login', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !['teacher', 'student'].includes(role)) return res.status(400).json({ error: 'Username, password, and role are required' });
  const user = await db.collection('users').findOne({ username: username.trim(), role });
  if (!user || user.password !== password) return res.status(401).json({ error: 'That username or password does not match.' });
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/signup', async (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) return res.status(400).json({ error: 'Name, username, and password are required' });

  const cleanName = name.trim();
  const cleanUsername = username.trim();
  if (cleanName.length < 2) return res.status(400).json({ error: 'Please enter your full name' });
  if (cleanUsername.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters long' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters long' });

  const role = 'student';
  if (await db.collection('users').findOne({ username: cleanUsername, role })) return res.status(409).json({ error: 'That student username is already taken' });

  const user = {
    username: cleanUsername,
    name: cleanName,
    role,
    password,
    createdAt: new Date()
  };

  const result = await db.collection('users').insertOne(user);
  const createdUser = { _id: result.insertedId, ...user };
  res.status(201).json({ token: signToken(createdUser), user: publicUser(createdUser) });
});

app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Current password and a new password of at least 8 characters are required' });
  const users = db.collection('users');
  const user = await users.findOne({ _id: new ObjectId(req.auth.id) });
  if (!user || user.password !== currentPassword) return res.status(401).json({ error: 'Current password is incorrect' });
  if (newPassword === user.password) return res.status(400).json({ error: 'New password must be different' });
  await users.updateOne({ _id: user._id }, { $set: { password: newPassword, passwordChangedAt: new Date() } });
  res.json({ token: signToken(user), message: 'Password changed successfully' });
});

app.get('/api/exams', requireAuth, async (req, res) => {
  const exams = await db.collection('exams').find({}).sort({ date: 1, time: 1 }).toArray();
  res.json(exams.map(exam => ({ ...exam, id: exam._id.toString(), questions: exam.questions.map(question => req.auth.role === 'student' ? { text: question.text, options: question.options } : question) })));
});

app.post('/api/exams', requireAuth, requireRole('teacher'), async (req, res) => {
  const { title, subject, date, time, duration, questions } = req.body;
  if (!title || !subject || !date || !time || !duration || !Array.isArray(questions) || !questions.length) return res.status(400).json({ error: 'Complete the exam and add at least one question' });
  const exam = { title, subject, date, time, duration: Number(duration), questions, createdBy: new ObjectId(req.auth.id), createdAt: new Date() };
  const result = await db.collection('exams').insertOne(exam);
  res.status(201).json({ ...exam, id: result.insertedId.toString() });
});

app.get('/api/teacher/scores', requireAuth, requireRole('teacher'), async (req, res) => {
  const exams = await db.collection('exams').find({ createdBy: new ObjectId(req.auth.id) }, { projection: { title: 1, subject: 1 } }).toArray();
  const examIds = exams.map(exam => exam._id);
  if (!examIds.length) return res.json([]);
  const examById = new Map(exams.map(exam => [exam._id.toString(), exam]));
  const submissions = await db.collection('submissions').find({ examId: { $in: examIds } }).sort({ submittedAt: -1 }).toArray();
  const studentIds = [...new Set(submissions.map(submission => submission.studentId.toString()))].map(id => new ObjectId(id));
  const students = await db.collection('users').find({ _id: { $in: studentIds } }, { projection: { name: 1, username: 1 } }).toArray();
  const studentById = new Map(students.map(student => [student._id.toString(), student]));
  res.json(submissions.map(submission => ({ id: submission._id.toString(), title: examById.get(submission.examId.toString())?.title || 'Exam', subject: examById.get(submission.examId.toString())?.subject || 'Exam', studentName: studentById.get(submission.studentId.toString())?.name || 'Student', username: studentById.get(submission.studentId.toString())?.username || '', score: submission.score, total: submission.total, submittedAt: submission.submittedAt })));
});

app.post('/api/submissions', requireAuth, requireRole('student'), async (req, res) => {
  const { examId, answers, automatic } = req.body;
  if (!ObjectId.isValid(examId) || !Array.isArray(answers)) return res.status(400).json({ error: 'Invalid submission' });
  const exam = await db.collection('exams').findOne({ _id: new ObjectId(examId) });
  if (!exam) return res.status(404).json({ error: 'Exam not found' });
  if (answers.length !== exam.questions.length || answers.some(answer => !Number.isInteger(answer) || answer < -1 || answer >= 4)) return res.status(400).json({ error: 'Invalid answers' });
  const score = answers.reduce((total, answer, index) => total + (answer === exam.questions[index].answer ? 1 : 0), 0);
  await db.collection('submissions').insertOne({ examId: exam._id, studentId: new ObjectId(req.auth.id), answers, score, total: exam.questions.length, automatic: Boolean(automatic), submittedAt: new Date() });
  res.json({ score, total: exam.questions.length });
});

app.get('/api/submissions', requireAuth, requireRole('student'), async (req, res) => {
  const submissions = await db.collection('submissions').find({ studentId: new ObjectId(req.auth.id) }).sort({ submittedAt: -1 }).toArray();
  const history = await Promise.all(submissions.map(async submission => {
    const exam = await db.collection('exams').findOne({ _id: submission.examId }, { projection: { title: 1, subject: 1 } });
    return { id: submission._id.toString(), examId: submission.examId.toString(), title: exam?.title || 'Previous exam', subject: exam?.subject || 'Exam', score: submission.score, total: submission.total, submittedAt: submission.submittedAt, automatic: submission.automatic };
  }));
  res.json(history);
});

async function seed() {
  const users = db.collection('users');
  const demoUsers = [
    { username: 'teacher', password: 'teach123', name: 'Ms. Elena Carter', role: 'teacher' },
    { username: 'student', password: 'study123', name: 'Jordan Lee', role: 'student' }
  ];
  for (const demo of demoUsers) {
    if (!(await users.findOne({ username: demo.username, role: demo.role }))) await users.insertOne({ username: demo.username, name: demo.name, role: demo.role, password: demo.password, createdAt: new Date() });
  }
  // Keep the database empty until the teacher creates real assessments.
}

async function start() {
  await connectDatabase();
  app.listen(port, () => console.log(`Assessly running at http://localhost:${port}`));
}

export default app;