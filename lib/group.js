const debug = require('debug')('trpg:component:group');
const event = require('./event');

module.exports = function GroupComponent(app) {
  initStorage.call(app);
  initFunction.call(app);
  initSocket.call(app);
  // initReset.call(app);
}

function initStorage() {
  let app = this;
  let storage = app.storage;
  storage.registerModel(require('./models/group.js'));
  storage.registerModel(require('./models/invite.js'));

  app.on('initCompleted', function(app) {
    // 数据信息统计
    debug('storage has been load 2 group db model');
  });
}

function initFunction() {
  let app = this;
  let storage = app.storage;
  app.group = {

  }
}

function initSocket() {
  let app = this;
  app.on('connection', function(socket) {
    let wrap = {app, socket};
    socket.on('group::create', event.create.bind(wrap));
    socket.on('group::getInfo', event.getInfo.bind(wrap));
    socket.on('group::sendGroupInvite', event.sendGroupInvite.bind(wrap));
  })
}
