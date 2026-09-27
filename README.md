
Teacher and student exam workflows backed by MongoDB.

## Default accounts

- Teacher: `teacher` / `teach123`
- Student: `student` / `study123`

## Run locally

1. Install MongoDB locally, or create a MongoDB Atlas database.
2. Copy `.env.example` to `.env` and set `MONGODB_URI`, `MONGODB_DB`, and a strong `JWT_SECRET`.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

The server seeds the default teacher and student accounts on an empty database. Create your real assessments in the teacher dashboard; exams and submissions are stored in MongoDB, passwords are hashed with bcrypt, and login sessions use JWT.

