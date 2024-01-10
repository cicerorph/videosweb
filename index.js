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

Array.prototype.randoms = function () {
    const result = [...this];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result.slice(0, 3);
};

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

webhook.send(`**I GOT RESTARTED**\nPermanent Token: ${token}\nLink to Generate an single token: [HERE](https://videos.mubi.tech/generateToken?token=${token})`);

app.post('/upload', upload.single('video'), async (req, res) => {
    const videoPath = '/uploads/' + req.file.filename;
    if (req.body.token !== token) {
        if (singleTokens.includes(req.body.token)) {
            const indexToRemove = singleTokens.indexOf(req.body.token);
            singleTokens.splice(indexToRemove, 1);
            saveTokensToFile(); // Save tokens to tokens.json after removal
        } else {
            fs.unlinkSync('.' + videoPath);
            return res.render('failedToken');
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
    const videoIndex = videos.findIndex(video => video.id === req.file.filename);
    if (videoIndex !== -1) {
        videos.splice(videoIndex, 1);
        fs.writeFileSync('./videos.json', JSON.stringify(videos));
    }

    videos.push({ id: req.file.filename, path: videoPath, thumbnail: videoPath + '.png', title: sanitizeHtml(req.body.title), description: sanitizeHtml(req.body.description).replace('\\r\\n', '\\n') });
    fs.writeFileSync('./videos.json', JSON.stringify(videos));

    res.redirect('/videos/' + req.file.filename);

    webhook.send(`**A video got uploaded**\nLink: [CLICK HERE](https://videos.mubi.tech/videos/${req.file.filename})`);
});

app.post('/delete', async (req, res) => {
    console.log(req.body)
    // Check if req.body is defined
    if (!req.body || !req.body.id || req.body.token !== token) {
      return res.render('failedToken');
    }
  
    const videoId = req.body.id;
  
    // Delete video from videos.json
    const videos = JSON.parse(fs.readFileSync('./videos.json', 'utf8'));
    const videoIndex = videos.findIndex(video => video.id === videoId);
    if (videoIndex !== -1) {
      videos.splice(videoIndex, 1);
      fs.writeFileSync('./videos.json', JSON.stringify(videos));
    }
  
    const videoFilePath1 = `./uploads/${videoId}`;
    if (fs.existsSync(videoFilePath1)) {
      fs.unlinkSync(videoFilePath1);
    }
  
    // Delete video file with extension "id.png"
    const videoFilePath2 = `./uploads/${videoId}.png`;
    if (fs.existsSync(videoFilePath2)) {
      fs.unlinkSync(videoFilePath2);
    }
  
    res.render('videodeleted');
});  

app.get('/upload', (req, res) => {
    res.render('upload');
});

app.get('/delete', (req, res) => {
    res.render('deletevideo');
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
        return res.render('failedToken');
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
