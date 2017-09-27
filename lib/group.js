const debug = require('debug')('trpg:component:group');
const event = require('./event');
const uuid = require('uuid');

module.exports = function GroupComponent(app) {
  initStorage.call(app);
  initFunction.call(app);
  initSocket.call(app);
  initReset.call(app);
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
    addGroupMember: function(groupUUID, userUUID, cb) {
      if(!groupUUID || !userUUID) {
        debug('add group need 2 uuid: receive %o', {groupUUID, userUUID});
        return;
      }

      storage.connect(function(db) {
        let modelGroup = db.models.group_group;
        let modelUser = db.models.player_user;

        modelGroup.one({uuid: groupUUID}, function(err, group) {
          if(!!err) {
            cb(err);
            return;
          }
          modelUser.one({uuid: userUUID}, function(err, user) {
            if(!!err) {
              cb(err);
              return;
            }

            group.addMember([user], function(err) {
              if(!!err) {
                cb(err);
              }else {
                cb(null);
              }
            })
          })
        })
      })
    }
  }
}

function initSocket() {
  let app = this;
  app.on('connection', function(socket) {
    let wrap = {app, socket};
    socket.on('group::create', event.create.bind(wrap));
    socket.on('group::getInfo', event.getInfo.bind(wrap));
    socket.on('group::sendGroupInvite', event.sendGroupInvite.bind(wrap));
    socket.on('group::refuseGroupInvite', event.refuseGroupInvite.bind(wrap));
    socket.on('group::agreeGroupInvite', event.agreeGroupInvite.bind(wrap));
    socket.on('group::getGroupInvite', event.getGroupInvite.bind(wrap));
  })
}

function initReset() {
  let app = this;
  app.on('resetStorage', function(storage, db) {
    debug('start reset group storage');
    if(app.player) {
      const modelUser = db.models.player_user;
      const modelGroup = db.models.group_group;
      modelGroup.create({
        uuid: uuid(),
        type: 'group',
        name: '测试团',
        avatar: '',
        creator_uuid: 'system',
        managers_uuid: [],
        maps_uuid: [],
      }, function(err, group) {
        if(!!err) {
          cb(err);
        }else {
          modelUser.get(1, function(err, user) {
            if(err) {
              console.error("reset group storage error", err);
            }else {
              // 创建组
              group.creator_uuid = user.uuid;
              group.setOwner(user, function(err) {});
              app.group.addGroupMember(group.uuid, user.uuid, function(err) {});
            }
          })
        }
      })

    }else{
      throw new Error('[GroupComponent] require component [PlayerComponent]');
    }
  })
}
