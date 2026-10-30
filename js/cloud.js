/* Capa de nube (Firebase Auth + Firestore, plan gratuito). Si no hay configuración, CLOUD.enabled = false. */
(function () {
  'use strict';
  const C = { enabled: false, DEL: null };
  const clean = (o) => JSON.parse(JSON.stringify(o));
  if (window.__CLOUD_MOCK) { Object.assign(C, window.__CLOUD_MOCK, { enabled: true }); window.CLOUD = C; return; }
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !window.firebase) { window.CLOUD = C; return; }
  firebase.initializeApp(cfg);
  const auth = firebase.auth(), db = firebase.firestore();
  try { db.enablePersistence({ synchronizeTabs: true }).catch(() => { }); } catch (e) { }
  C.enabled = true; C.DEL = firebase.firestore.FieldValue.delete();
  C.onAuth = (cb) => auth.onAuthStateChanged(u => cb(u ? { email: u.email } : null));
  C.signIn = (e, p) => auth.signInWithEmailAndPassword(e, p);
  C.signOut = () => auth.signOut();
  C.reset = (e) => auth.sendPasswordResetEmail(e);
  C.createAccount = async (email, pw) => {
    const app2 = firebase.apps.find(a => a.name === 'sec') || firebase.initializeApp(cfg, 'sec');
    try { await app2.auth().createUserWithEmailAndPassword(email, pw); } finally { try { await app2.auth().signOut(); } catch (e) { } }
  };
  C.listen = (h) => {
    const fail = (c) => (err) => h.error && h.error(c, err);
    const col = (name, key, q) => (q || db.collection(name)).onSnapshot(s => h[key](s.docChanges().map(ch => ({ type: ch.type, id: ch.doc.id, data: ch.doc.data(), pending: ch.doc.metadata.hasPendingWrites }))), fail(name));
    const u = [
      db.collection('meta').doc('config').onSnapshot(d => h.meta(d.exists ? d.data() : null), fail('meta')),
      col('ops', 'ops'), col('seguimientos', 'seg'), col('log', 'log', db.collection('log').orderBy('ts', 'desc').limit(3000))];
    return () => u.forEach(f => f());
  };
  C.setDoc = (coll, id, data) => db.collection(coll).doc(id).set(clean(data));
  C.updateDoc = (coll, id, f) => { const o = {}; Object.keys(f).forEach(k => o[k] = f[k] === C.DEL ? C.DEL : clean({ v: f[k] }).v); return db.collection(coll).doc(id).set(o, { merge: true }); };
  C.deleteDoc = (coll, id) => db.collection(coll).doc(id).delete();
  C.setMeta = (d) => db.collection('meta').doc('config').set(clean(d));
  C.setAcl = (d) => db.collection('meta').doc('acl').set(clean(d));
  C.batchSet = async (coll, items) => {
    for (let i = 0; i < items.length; i += 400) { const b = db.batch(); items.slice(i, i + 400).forEach(x => b.set(db.collection(coll).doc(String(x.id)), clean(x))); await b.commit(); }
  };
  window.CLOUD = C;
})();
