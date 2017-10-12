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
  storage.registerModel(require('./models/actor.js'));

  app.on('initCompleted', function(app) {
    // 数据信息统计
    debug('storage has been load 3 group db model');
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
  app.registerEvent('group::create', event.create);
  app.registerEvent('group::getInfo', event.getInfo);
  app.registerEvent('group::sendGroupInvite', event.sendGroupInvite);
  app.registerEvent('group::refuseGroupInvite', event.refuseGroupInvite);
  app.registerEvent('group::agreeGroupInvite', event.agreeGroupInvite);
  app.registerEvent('group::getGroupInvite', event.getGroupInvite);
  app.registerEvent('group::getGroupList', event.getGroupList);
  app.registerEvent('group::getGroupActors', event.getGroupActors);
}

function initReset() {
  let app = this;
  app.on('resetStorage', async function(storage, db) {
    debug('start reset group storage');
    if(!app.player) {
      throw new Error('[GroupComponent] require component [PlayerComponent]');
    }
    if(!app.actor) {
      throw new Error('[GroupComponent] require component [ActorComponent]');
    }

    try {
      const modelUser = db.models.player_user;
      const modelGroup = db.models.group_group;
      let group = await modelGroup.createAsync({
        uuid: uuid(),
        type: 'group',
        name: '测试团',
        avatar: '',
        creator_uuid: 'system',
        managers_uuid: [],
        maps_uuid: [],
      })
      let user = await modelUser.getAsync(1);
      group.creator_uuid = user.uuid;
      group.setOwner(user, function(err) {});
      app.group.addGroupMember(group.uuid, user.uuid, function(err) {});

      // 增加测试的团人物
      const modelGroupActor = db.models.group_actor;
      const modelActor = db.models.actor_actor;
      let actor = await modelActor.getAsync(1);
      let groupActor = await modelGroupActor.createAsync({
        actor_uuid: actor.uuid,
        actor_info: {},
        avatar: '',
      })
      await groupActor.setOwnerAsync(user);
      await groupActor.setActorAsync(actor);
      await groupActor.setGroupAsync(group);
    }catch(err) {
      throw new Error(err);
    }
  })
}
