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

app.get('/api/products', async (req, res) => {
  try {
    const products = await getSupabaseProducts();
    return res.json(products.filter(product => product.active !== false));
  } catch (supaErr) {
    console.warn('[products] Supabase failed, using JSON fallback:', supaErr.message);
    try {
      const products = readProducts();
      return res.json(products.filter(product => product.active !== false));
    } catch (jsonErr) {
      console.error(jsonErr);
      return res.status(500).json({
        error: 'Failed to load products'
      });
    }
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

app.get('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const products = await getSupabaseProducts();
    return res.json(products);
  } catch (supaErr) {
    console.warn('[admin/products] Supabase failed, using JSON fallback:', supaErr.message);
    try {
      return res.json(readProducts());
    } catch (jsonErr) {
      console.error(jsonErr);
      return res.status(500).json({ error: 'Failed to load products' });
    }
  }
});

/* ADMIN: ADD PRODUCT */

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || ('product-' + Date.now());
}

async function supabaseInsert(pathStr, body) {
  const url = SUPABASE_URL + '/rest/v1/' + pathStr;
  const writeKey = SUPABASE_SECRET_KEY || SUPABASE_KEY;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: writeKey,
      Authorization: 'Bearer ' + writeKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Supabase insert ' + res.status + ': ' + text);
  }
  const rows = await res.json();
  return rows[0];
}

async function saveProductSizes(productId, sizes) {
  const writeKey = SUPABASE_SECRET_KEY || SUPABASE_KEY;
  // delete existing
  const delRes = await fetch(SUPABASE_URL + '/rest/v1/product_sizes?product_id=eq.' + encodeURIComponent(productId), {
    method: 'DELETE',
    headers: {
      apikey: writeKey,
      Authorization: 'Bearer ' + writeKey
    }
  });
  if (!delRes.ok) {
    const t = await delRes.text();
    throw new Error('Size delete failed: ' + t);
  }
  // insert new
  if (Array.isArray(sizes) && sizes.length) {
    const body = sizes.map(function (sz) {
      return { product_id: productId, size: String(sz) };
    });
    const insRes = await fetch(SUPABASE_URL + '/rest/v1/product_sizes', {
      method: 'POST',
      headers: {
        apikey: writeKey,
        Authorization: 'Bearer ' + writeKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(body)
    });
    if (!insRes.ok) {
      const t = await insRes.text();
      throw new Error('Size insert failed: ' + t);
    }
  }
}

async function findCategoryIdByName(name) {
  if (!name) return null;
  const rows = await supabaseFetch('categories?select=id,name&name=eq.' + encodeURIComponent(name) + '&limit=1');
  return rows && rows[0] ? rows[0].id : null;
}

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  const {
    name,
    category,
    price,
    description,
    image,
    active
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Product name is required' });
  }

  try {
    const categoryId = await findCategoryIdByName(String(category || '').trim());
    const nowIso = new Date().toISOString();
    const payload = {
      name: String(name).trim(),
      slug: slugify(name) + '-' + Date.now().toString(36),
      description: String(description || '').trim() || null,
      category_id: categoryId,
      price: price === '' || price == null ? null : Number(price),
      compare_at_price: null,
      sku: null,
      is_active: active !== false,
      is_new: false,
      is_featured: false,
      is_trending: false,
      image_url: String(image || '').trim() || null,
      created_at: nowIso,
      updated_at: nowIso
    };

    const inserted = await supabaseInsert('products', payload);
    if (inserted && inserted.id && Array.isArray(req.body.sizes)) {
      try { await saveProductSizes(inserted.id, req.body.sizes); }
      catch (e) { console.warn('[POST sizes]', e.message); }
      inserted.sizes = req.body.sizes;
    }
    return res.json({ success: true, product: inserted });

  } catch (supaErr) {
    console.warn('[admin/products POST] Supabase failed, using JSON fallback:', supaErr.message);
    try {
      const products = readProducts();
      const product = {
        id: Date.now().toString(),
        name: String(name).trim(),
        category: String(category || 'Other').trim(),
        price: price === '' || price == null ? null : Number(price),
        description: String(description || '').trim(),
        image: String(image || '').trim(),
        active: active !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      products.unshift(product);
      writeProducts(products);
      return res.json({ success: true, product });
    } catch (jsonErr) {
      console.error(jsonErr);
      return res.status(500).json({ error: 'Failed to create product' });
    }
  }
});

/* ADMIN: UPDATE PRODUCT */

async function supabaseUpdate(pathStr, body) {
  const url = SUPABASE_URL + '/rest/v1/' + pathStr;
  const writeKey = SUPABASE_SECRET_KEY || SUPABASE_KEY;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: writeKey,
      Authorization: 'Bearer ' + writeKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Supabase update ' + res.status + ': ' + text);
  }
  const rows = await res.json();
  return rows[0];
}

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const update = { updated_at: new Date().toISOString() };

    if (req.body.name !== undefined) update.name = String(req.body.name).trim();
    if (req.body.price !== undefined) {
      update.price = req.body.price === '' || req.body.price == null ? null : Number(req.body.price);
    }
    if (req.body.description !== undefined) update.description = String(req.body.description).trim() || null;
    if (req.body.image !== undefined) update.image_url = String(req.body.image).trim() || null;
    if (req.body.active !== undefined) update.is_active = Boolean(req.body.active);
    if (req.body.category !== undefined) {
      update.category_id = await findCategoryIdByName(String(req.body.category).trim());
    }

    const updated = await supabaseUpdate('products?id=eq.' + encodeURIComponent(id), update);
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    if (Array.isArray(req.body.sizes)) {
      try { await saveProductSizes(id, req.body.sizes); }
      catch (e) { console.warn('[PUT sizes]', e.message); }
      updated.sizes = req.body.sizes;
    }
    return res.json({ success: true, product: updated });

  } catch (supaErr) {
    console.warn('[admin/products PUT] Supabase failed, using JSON fallback:', supaErr.message);
    try {
      const products = readProducts();
      const index = products.findIndex(p => String(p.id) === String(id));
      if (index === -1) return res.status(404).json({ error: 'Product not found' });
      const old = products[index];
      const updated = {
        ...old,
        name: req.body.name !== undefined ? String(req.body.name).trim() : old.name,
        category: req.body.category !== undefined ? String(req.body.category).trim() : old.category,
        price: req.body.price === '' || req.body.price == null ? null : req.body.price !== undefined ? Number(req.body.price) : old.price,
        description: req.body.description !== undefined ? String(req.body.description).trim() : old.description,
        image: req.body.image !== undefined ? String(req.body.image).trim() : old.image,
        active: req.body.active !== undefined ? Boolean(req.body.active) : old.active,
        updatedAt: new Date().toISOString()
      };
      products[index] = updated;
      writeProducts(products);
      return res.json({ success: true, product: updated });
    } catch (jsonErr) {
      console.error(jsonErr);
      return res.status(500).json({ error: 'Failed to update product' });
    }
  }
});

/* ADMIN: DELETE PRODUCT */

async function supabaseDelete(pathStr) {
  const url = SUPABASE_URL + '/rest/v1/' + pathStr;
  const writeKey = SUPABASE_SECRET_KEY || SUPABASE_KEY;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      apikey: writeKey,
      Authorization: 'Bearer ' + writeKey,
      Prefer: 'return=representation'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Supabase delete ' + res.status + ': ' + text);
  }
  return res.json();
}

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const rows = await supabaseDelete('products?id=eq.' + encodeURIComponent(id));
    if (!rows || !rows.length) return res.status(404).json({ error: 'Product not found' });
    return res.json({ success: true, message: 'Product deleted' });
  } catch (supaErr) {
    console.warn('[admin/products DELETE] Supabase failed, using JSON fallback:', supaErr.message);
    try {
      let products = readProducts();
      const exists = products.some(p => String(p.id) === String(id));
      if (!exists) return res.status(404).json({ error: 'Product not found' });
      products = products.filter(p => String(p.id) !== String(id));
      writeProducts(products);
      return res.json({ success: true, message: 'Product deleted' });
    } catch (jsonErr) {
      console.error(jsonErr);
      return res.status(500).json({ error: 'Failed to delete product' });
    }
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


/* =========================
   SUPABASE (Charley Collection)
   Additive — does NOT touch existing routes
========================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('[Supabase] SUPABASE_URL or SUPABASE_KEY missing in .env');
}

async function supabaseFetch(pathStr) {
  const url = SUPABASE_URL + '/rest/v1/' + pathStr;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Supabase ' + res.status + ': ' + text);
  }
  return res.json();
}

async function getSupabaseProducts() {
  const rows = await supabaseFetch('products?select=*,categories(id,name,slug)');

  let sizesByProduct = {};
  try {
    const sizeRows = await supabaseFetch('product_sizes?select=product_id,size');
    sizeRows.forEach(function (r) {
      if (!sizesByProduct[r.product_id]) sizesByProduct[r.product_id] = [];
      sizesByProduct[r.product_id].push(r.size);
    });
  } catch (e) {
    console.warn('[sizes] failed to load sizes:', e.message);
  }

  return rows.map(function (r) {
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      category: r.categories ? r.categories.name : '',
      category_id: r.category_id,
      price: r.price,
      compare_at_price: r.compare_at_price,
      description: r.description,
      image: r.image_url,
      sku: r.sku,
      active: r.is_active,
      is_new: r.is_new,
      is_featured: r.is_featured,
      is_trending: r.is_trending,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      sizes: sizesByProduct[r.id] || []
    };
  });
}

app.get('/api/v2/products', async function (req, res) {
  try {
    const products = await getSupabaseProducts();
    res.json(products);
  } catch (e) {
    console.error('[v2/products]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   SUPABASE STORAGE UPLOAD
   Additive — does NOT touch existing routes
========================= */

async function uploadToSupabaseStorage(buffer, originalName, mimetype) {
  const ext = (originalName.split('.').pop() || 'jpg').toLowerCase();
  const fname = Date.now() + '-' + Math.random().toString(36).substring(2, 10) + '.' + ext;
  const url = SUPABASE_URL + '/storage/v1/object/product-images/' + fname;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': mimetype || 'application/octet-stream',
      'x-upsert': 'false'
    },
    body: buffer
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Supabase Storage ' + res.status + ': ' + text);
  }
  return SUPABASE_URL + '/storage/v1/object/public/product-images/' + fname;
}

const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.post(
  '/api/admin/products/upload-image-supabase',
  requireAdmin,
  uploadMemory.single('image'),
  async function (req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image file received' });
      }
      const publicUrl = await uploadToSupabaseStorage(req.file.buffer, req.file.originalname, req.file.mimetype);
      return res.json({
        success: true,
        url: publicUrl,
        filename: req.file.originalname
      });
    } catch (e) {
      console.error('[upload-image-supabase]', e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  }
);
