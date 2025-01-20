const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB接続
mongoose.connect('your_mongodb_connection_string', { useNewUrlParser: true, useUnifiedTopology: true });

// ユーザーモデル
const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
});
const User = mongoose.model('User', UserSchema);

// 動画モデル
const VideoSchema = new mongoose.Schema({
    filename: String,
    url: String,
    uploadedBy: String,
});
const Video = mongoose.model('Video', VideoSchema);

// Multerの設定
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ユーザー登録エンドポイント
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.status(201).send('ユーザー登録が成功しました');
});

// ログインエンドポイント
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !await bcrypt.compare(password, user.password)) {
        return res.status(400).send('認証に失敗しました');
    }
    const token = jwt.sign({ username: user.username }, 'your_jwt_secret');
    res.json({ token });
});

// 動画アップロードエンドポイント
app.post('/upload', upload.single('video'), async (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    const decoded = jwt.verify(token, 'your_jwt_secret');
    const video = new Video({ filename: req.file.filename, url: `/uploads/${req.file.filename}`, uploadedBy: decoded.username });
    await video.save();
    res.status(200).json({ url: `/uploads/${req.file.filename}` });
});

// 動画リスト取得エンドポイント
app.get('/videos', async (req, res) => {
    const videos = await Video.find();
    res.json(videos);
});

// ストリーミングエンドポイント
app.get('/stream/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(206, head);
        file.pipe(res);
    } else {
        const head = {
            'Content-Length': fileSize,
            'Content-Type': 'video/mp4',
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
    }
});

// サーバーの開始
app.listen(port, () => {
    console.log(`サーバーがポート ${port} で起動しました`);
});
