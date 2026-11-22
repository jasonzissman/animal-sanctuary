/* SA.photoStore: album pictures in IndexedDB (AS-0236). A thin, defensive wrapper: it works from file:// in Chrome and reports
 * "unavailable" instead of throwing when IndexedDB is missing, blocked or failing. Nothing here ever rejects or blocks the photo flow.
 *
 *   SA.photoStore.put(id, data)  Promise<boolean>  saves a JPEG data URL (or Blob) under the picture id; false when it could not
 *   SA.photoStore.get(id)        Promise<data|null>
 *   SA.photoStore.del(id)        Promise<boolean>
 *   SA.photoStore.available()    Promise<boolean>  true once the database has opened
 *   SA.photoStore.create(idb)    a fresh store over any IDBFactory-shaped object (tests pass a stub, or nothing)
 * Database 'santuario_photos', object store 'pics' (key = picture id). The save only keeps ids/dates (SA.albumPics).
 */
(function (root) {
  'use strict';
  var SA = root.SA = root.SA || {};
  var DB = 'santuario_photos';
  var STORE = 'pics';

  function create(idb) {
    var opened = null;

    function open() {
      if (opened) return opened;
      opened = new Promise(function (resolve) {
        try {
          if (!idb || typeof idb.open !== 'function') { resolve(null); return; }
          var req = idb.open(DB, 1);
          req.onupgradeneeded = function () {
            try { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); } catch (e) { /* reported by onerror/onsuccess */ }
          };
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { resolve(null); };
          req.onblocked = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
      return opened;
    }

    // Runs one request on the store; resolves with its result, or `fail` when anything goes wrong.
    function run(mode, fail, make) {
      return open().then(function (db) {
        if (!db) return fail;
        return new Promise(function (resolve) {
          try {
            var tx = db.transaction(STORE, mode);
            var req = make(tx.objectStore(STORE));
            tx.onabort = tx.onerror = function () { resolve(fail); };
            tx.oncomplete = function () { resolve(mode === 'readwrite' ? true : (req && req.result !== undefined ? req.result : null)); };
          } catch (e) { resolve(fail); }
        });
      }).catch(function () { return fail; });
    }

    return {
      put: function (id, data) { return typeof id === 'string' && id && data ? run('readwrite', false, function (s) { return s.put(data, id); }) : Promise.resolve(false); },
      get: function (id) { return typeof id === 'string' && id ? run('readonly', null, function (s) { return s.get(id); }) : Promise.resolve(null); },
      del: function (id) { return typeof id === 'string' && id ? run('readwrite', false, function (s) { return s.delete(id); }) : Promise.resolve(false); },
      available: function () { return open().then(function (db) { return !!db; }); }
    };
  }

  var idb = null;
  try { idb = root.indexedDB || null; } catch (e) { idb = null; }   // some browsers throw on access (blocked storage)
  var shared = create(idb);
  SA.photoStore = { create: create, put: shared.put, get: shared.get, del: shared.del, available: shared.available };
})(typeof window !== 'undefined' ? window : globalThis);
