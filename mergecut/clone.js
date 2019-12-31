/**
 *
 *
 * @module clone
 *
 * Created by Evgeniy Malyarov on 31.12.2019.
 */

const PouchDB = require('../pouchdb');
const {start} = require('./config');
const {DBUSER, DBPWD} = process.env;
const limit = 200;
const timeout = 120000;
const cnames = ['doc.calc_order', 'cat.characteristics'];
let step = 0, dcount = 0, scount = 0;

module.exports = function ({src, tgt}) {

  let index = 1;

  // перебирает базы в асинхронном цикле
  function next(dbs) {
    index++;
    let name = dbs[index];
    if(name && name[0] !== '_') {
      return clone(src, tgt, name)
        .then(() => next(dbs));
    }
    else if(name) {
      return next(dbs);
    }
  }

  // получаем массив всех баз
  return new PouchDB(`${src}/_all_dbs`, {
    auth: {
      username: DBUSER,
      password: DBPWD
    },
    skip_setup: true,
    ajax: {timeout}
  }).info()
    .then(next);

};

function sleep(time, res) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(res), time);
  });
}

// выполняет обслуживание
function clone(src, tgt, name) {
  // получаем базы
  src = new PouchDB(`${src}/${name}`, {
    auth: {
      username: DBUSER,
      password: DBPWD
    },
    skip_setup: true,
    ajax: {timeout}
  });
  tgt = new PouchDB(`${tgt}/${name}`, {
    auth: {
      username: DBUSER,
      password: DBPWD
    },
    ajax: {timeout}
  });

  return next_docs(src, tgt, '');

}

function next_docs(src, tgt, startkey) {
  return src.allDocs({
    include_docs: true,
    attachments: true,
    startkey,
    endkey: '\u0fff',
    skip: startkey ? 1 : 0,
    limit,
  })
    .then(({rows}) => clone_docs(rows, tgt))
    .then((rows) => rows.length === limit && next_docs(src, tgt, rows[rows.length-1].key));
}

function clone_docs(rows, tgt) {
  const docs = rows
    .map(({doc}) => doc)
    .filter((doc) => {
      if(doc._id.startsWith('_') || !tgt.name.includes('_doc') || !cnames.includes(doc.class_name)) {
        return true;
      }
      return doc.timestamp && doc.timestamp.moment > start;
    });
  if(!docs.length) {
    return rows;
  }
  // получаем ревизии документов, которые могут уже присутствовать в tgt и фильтруем
  return tgt
    .allDocs({keys: rows.map(({key}) => key)})
    .then((res) => {
      const filtered = docs.filter((doc) => {
        return !res.rows.some((tdoc) => {
          return tdoc.id === doc._id && tdoc.value.rev >= doc._rev;
        });
      });
      step++;
      scount += docs.length;
      dcount += filtered.length;
      console.log(`${tgt.name} step: ${step}, scount: ${scount}, dcount: ${dcount}`);
      return filtered.length && tgt.bulkDocs(filtered, {new_edits: false});
    })
    .then(() => sleep(100, rows));
}