require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
const photosFile = path.join(dataDir, 'photos.json');

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(photosFile)) {
  fs.writeFileSync(photosFile, '[]');
}

app.use(express.json());

/* =========================
   SESSION
========================= */

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 2 * 60 * 60 * 1000
  }
}));

/* =========================
   STATIC FILES
========================= */

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

/* =========================
   PAGES
========================= */

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

/* =========================
   AUTH MIDDLEWARE
========================= */

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));

  if (ba.length !== bb.length) {
    return false;
  }

  return crypto.timingSafeEqual(ba, bb);
}

function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  next();
}

/* =========================
   ADMIN LOGIN
========================= */

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  const validUser = safeEqual(
    username,
    process.env.ADMIN_USER
  );

  const validPassword = safeEqual(
    password,
    process.env.ADMIN_PASSWORD
  );

  if (!validUser || !validPassword) {
    return res.status(401).json({
      error: 'Invalid username or password'
    });
  }

  req.session.regenerate((err) => {
    if (err) {
      console.error(err);

      return res.status(500).json({
        error: 'Login failed'
      });
    }

    req.session.admin = true;

    res.json({
      success: true,
      message: 'Login successful'
    });
  });
});

/* =========================
   CHECK LOGIN
========================= */

app.get('/api/admin/me', (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      authenticated: false
    });
  }

  res.json({
    authenticated: true
  });
});

/* =========================
   LOGOUT
========================= */

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(err);

      return res.status(500).json({
        error: 'Logout failed'
      });
    }

    res.clearCookie('connect.sid');

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});

/* =========================
   PUBLIC PHOTO GALLERY
========================= */

app.get('/api/attachments', (req, res) => {
  try {
    const photos = JSON.parse(
      fs.readFileSync(photosFile, 'utf8')
    );

    const result = photos.map(photo => ({
      ...photo,
      url: '/uploads/' + photo.filename
    }));

    res.json(result);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to load photos'
    });
  }
});

/* =========================
   MULTER
========================= */

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    const name =
      Date.now() +
      '-' +
      Math.random().toString(36).substring(2, 10) +
      ext;

    cb(null, name);
  }
});

const upload = multer({
  storage,

  limits: {
    fileSize: 20 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

/* =========================
   ADMIN PHOTO LIST
========================= */

app.get('/api/admin/photos', requireAdmin, (req, res) => {
  try {
    const photos = JSON.parse(
      fs.readFileSync(photosFile, 'utf8')
    );

    const result = photos.map(photo => ({
      ...photo,
      url: '/uploads/' + photo.filename
    }));

    res.json(result);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to load admin photos'
    });
  }
});

/* =========================
   ADMIN PHOTO UPLOAD
========================= */

app.post(
  '/api/admin/upload',
  requireAdmin,
  upload.single('photo'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Please select a photo'
        });
      }

      const photos = JSON.parse(
        fs.readFileSync(photosFile, 'utf8')
      );

      const title = String(
        req.body.title || 'Untitled'
      ).trim().substring(0, 200);

      const photo = {
        id: Date.now(),
        title: title || 'Untitled',
        filename: req.file.filename,
        originalName: req.file.originalname,
        uploadedAt: new Date().toISOString()
      };

      photos.unshift(photo);

      fs.writeFileSync(
        photosFile,
        JSON.stringify(photos, null, 2)
      );

      res.json({
        success: true,
        message: 'Photo uploaded successfully',
        photo: {
          ...photo,
          url: '/uploads/' + photo.filename
        }
      });

    } catch (error) {
      console.error(error);

      if (req.file && req.file.path) {
        try {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
        } catch (cleanupError) {
          console.error(cleanupError);
        }
      }

      res.status(500).json({
        error: 'Upload failed'
      });
    }
  }
);

/* =========================
   ADMIN PHOTO DELETE
========================= */

app.delete(
  '/api/admin/photos/:id',
  requireAdmin,
  (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isFinite(id)) {
        return res.status(400).json({
          error: 'Invalid photo ID'
        });
      }

      let photos = JSON.parse(
        fs.readFileSync(photosFile, 'utf8')
      );

      const photo = photos.find(
        p => p.id === id
      );

      if (!photo) {
        return res.status(404).json({
          error: 'Photo not found'
        });
      }

      const safeFilename = path.basename(
        photo.filename
      );

      const filePath = path.join(
        uploadDir,
        safeFilename
      );

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      photos = photos.filter(
        p => p.id !== id
      );


      fs.writeFileSync(
        photosFile,
        JSON.stringify(photos, null, 2)
      );

      res.json({
        success: true,
        message: 'Photo deleted'
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: 'Delete failed'
      });
    }
  }
);

/* =========================
   HEALTH CHECK
========================= */

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Hariom Photography API is running'
  });
});

/* =========================
   SERVER
========================= */

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Hariom Photography running on port ${PORT}`
  );
});
