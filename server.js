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
   ECOMMERCE PRODUCTS
========================= */

const productsFile = path.join(dataDir, 'products.json');
const categoriesFile = path.join(dataDir, 'categories.json');

if (!fs.existsSync(productsFile)) {
  fs.writeFileSync(productsFile, '[]');
}

if (!fs.existsSync(categoriesFile)) {
  fs.writeFileSync(categoriesFile, '[]');
}

function readProducts() {
  return JSON.parse(
    fs.readFileSync(productsFile, 'utf8')
  );
}

function writeProducts(products) {
  fs.writeFileSync(
    productsFile,
    JSON.stringify(products, null, 2)
  );
}

function readCategories() {
  return JSON.parse(
    fs.readFileSync(categoriesFile, 'utf8')
  );
}

/* PUBLIC: GET PRODUCTS */

app.get('/api/products', (req, res) => {
  try {
    const products = readProducts();

    res.json(products.filter(product => product.active !== false));

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to load products'
    });
  }
});

/* PUBLIC: GET CATEGORIES */

app.get('/api/categories', (req, res) => {
  try {
    res.json(readCategories());

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to load categories'
    });
  }
});

/* ADMIN: GET ALL PRODUCTS */

app.get('/api/admin/products', requireAdmin, (req, res) => {
  try {
    res.json(readProducts());

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to load products'
    });
  }
});

/* ADMIN: ADD PRODUCT */

app.post('/api/admin/products', requireAdmin, (req, res) => {
  try {
    const {
      name,
      category,
      price,
      description,
      image,
      active
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        error: 'Product name is required'
      });
    }

    const products = readProducts();

    const product = {
      id: Date.now().toString(),
      name: String(name).trim(),
      category: String(category || 'Other').trim(),
      price: price === '' || price == null
        ? null
        : Number(price),
      description: String(description || '').trim(),
      image: String(image || '').trim(),
      active: active !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    products.unshift(product);
    writeProducts(products);

    res.json({
      success: true,
      product
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to create product'
    });
  }
});

/* ADMIN: UPDATE PRODUCT */

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  try {
    const products = readProducts();

    const index = products.findIndex(
      product => String(product.id) === String(req.params.id)
    );

    if (index === -1) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    const old = products[index];

    const updated = {
      ...old,
      name: req.body.name !== undefined
        ? String(req.body.name).trim()
        : old.name,

      category: req.body.category !== undefined
        ? String(req.body.category).trim()
        : old.category,

      price:
        req.body.price === '' || req.body.price == null
          ? null
          : req.body.price !== undefined
            ? Number(req.body.price)
            : old.price,

      description: req.body.description !== undefined
        ? String(req.body.description).trim()
        : old.description,

      image: req.body.image !== undefined
        ? String(req.body.image).trim()
        : old.image,

      active: req.body.active !== undefined
        ? Boolean(req.body.active)
        : old.active,

      updatedAt: new Date().toISOString()
    };

    products[index] = updated;

    writeProducts(products);

    res.json({
      success: true,
      product: updated
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to update product'
    });
  }
});

/* ADMIN: DELETE PRODUCT */

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  try {
    let products = readProducts();

    const exists = products.some(
      product => String(product.id) === String(req.params.id)
    );

    if (!exists) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    products = products.filter(
      product => String(product.id) !== String(req.params.id)
    );

    writeProducts(products);

    res.json({
      success: true,
      message: 'Product deleted'
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Failed to delete product'
    });
  }
});

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

/* ADMIN: PRODUCT IMAGE UPLOAD */

app.post(
  '/api/admin/products/upload-image',
  requireAdmin,
  upload.single('image'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No image file received'
        });
      }

      res.status(200).json({
        success: true,
        url: '/uploads/' + req.file.filename,
        filename: req.file.filename,
        originalName: req.file.originalname
      });

    } catch (error) {
      console.error('PRODUCT IMAGE UPLOAD ERROR:', error);

      res.status(500).json({
        success: false,
        error: 'Image upload failed'
      });
    }
  }
);

