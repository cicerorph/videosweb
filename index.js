const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const sanitizeHtml = require('sanitize-html');
const { Webhook } = require('simple-discord-webhooks');
const extractFrames = require('ffmpeg-extract-frames');
const conf = require('./config.json');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.set('view engine', 'ejs');

const upload = multer({
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        if (!file.mimetype.startsWith('video/')) {
            return cb(new Error('You need to upload a video matey'));
        }
        cb(null, true);
    },
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, 'uploads/');
        },
        filename: (req, file, cb) => {
            const randomHash = crypto.randomBytes(8).toString('hex');
            const ext = path.extname(file.originalname);
            cb(null, randomHash + ext);
        },
    }),
});

const tokensFilePath = path.join(__dirname, 'tokens.json');

let singleTokens = [];

// Load existing tokens from tokens.json
try {
    const tokensFileContent = fs.readFileSync(tokensFilePath, 'utf8');
    singleTokens = JSON.parse(tokensFileContent);
} catch (err) {
    // Ignore if the file doesn't exist or is invalid JSON
}

const webhook = new Webhook(conf.WEBHOOK);

// Function to save tokens to tokens.json
function saveTokensToFile() {
    fs.writeFileSync(tokensFilePath, JSON.stringify(singleTokens));
}

const token = crypto.randomBytes(8).toString('hex');

webhook.send(`**I GOT RESTARTED**\nPermanent Token: ${token}`);

app.post('/upload', upload.single('video'), async (req, res) => {
    const videoPath = '/uploads/' + req.file.filename;
    if (req.body.token !== token) {
        if (singleTokens.includes(req.body.token)) {
            const indexToRemove = singleTokens.indexOf(req.body.token);
            singleTokens.splice(indexToRemove, 1);
        } else {
            fs.unlinkSync('.' + videoPath);
            return res.status(403).send('Invalid token');
        }
    }

    await extractFrames({
        input: '.' + videoPath,
        output: '.' + videoPath + '.png',
        offsets: [
            0,
        ],
    });

    const videos = JSON.parse(fs.readFileSync('./videos.json', 'utf8'));
    videos.push({ id: req.file.filename, path: videoPath, thumbnail: videoPath + '.png', title: sanitizeHtml(req.body.title), description: sanitizeHtml(req.body.description).replace('\\r\\n', '\\n') });
    fs.writeFileSync('./videos.json', JSON.stringify(videos));

    res.redirect('/videos/' + req.file.filename);

    webhook.send(`**A video got uploaded**\nLink: [CLICK HERE](https://videos.mubi.tech/videos/${req.file.filename})`);
});

app.get('/upload', (req, res) => {
    res.render('upload');
});

app.get('/videos', (req, res) => {
    const videos = JSON.parse(fs.readFileSync('./videos.json', 'utf8'));
    res.render('videos', { videos: videos });
});

app.get('/', (req, res) => {
    const videos = JSON.parse(fs.readFileSync('./videos.json', 'utf8'));
    res.render('videos', { videos: videos });
});

app.get('/videos/:id', (req, res, next) => {
    const videos = JSON.parse(fs.readFileSync('./videos.json', 'utf8'));
    const videoIndex = videos.findIndex(video => video.id === req.params.id);
    if (videoIndex !== -1) {
        const video = videos[videoIndex];
        videos.splice(videoIndex, 1);
        res.render('watchvideo', { video: video, videos: videos.randoms() });
    } else {
        next();
    }
});

app.get('/generateToken', (req, res) => {
    if (req.query.token !== token) {
        return res.send('Invalid token');
    }
    const generatedToken = crypto.randomBytes(8).toString('hex');
    singleTokens.push(generatedToken);
    saveTokensToFile();
    res.send(generatedToken);
});

app.use((req, res) => {
    res.status(404).render('error');
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});