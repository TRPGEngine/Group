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
  // storage.registerModel(require('./models/actorCheck.js'));

  app.on('initCompleted', function(app) {
    // 数据信息统计
    debug('storage has been load 4 group db model');
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
              db.close();
            })
          })
        })
      })
    },
    addGroupMemberAsync: async function(groupUUID, userUUID) {
      if(!groupUUID || !userUUID) {
        debug('add group need 2 uuid: receive %o', {groupUUID, userUUID});
        return;
      }

      try {
        let db = await storage.connectAsync();
        let group = await db.models.group_group.oneAsync({uuid: groupUUID});
        let user = await db.models.player_user.oneAsync({uuid: userUUID});
        if(group && user) {
          let res = await group.addMembersAsync([user]);
          db.close();
          return res;
        }else {
          db.close();
          throw new Error(`团信息不全或添加的成员信息不全: ${groupUUID} ${userUUID}`);
        }
      }catch(err){
        console.error('[addGroupMemberAsync]', err);
        throw err;
      }
    },
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
  app.registerEvent('group::getGroupMembers', event.getGroupMembers);
  app.registerEvent('group::getGroupActors', event.getGroupActors);
  // app.registerEvent('group::getGroupActorChecks', event.getGroupActorChecks);
  app.registerEvent('group::addGroupActor', event.addGroupActor);
  // app.registerEvent('group::sendGroupActorCheck', event.sendGroupActorCheck);
  app.registerEvent('group::agreeGroupActor', event.agreeGroupActor);
  app.registerEvent('group::refuseGroupActor', event.refuseGroupActor);
  app.registerEvent('group::setPlayerSelectedGroupActor', event.setPlayerSelectedGroupActor);
  app.registerEvent('group::getPlayerSelectedGroupActor', event.getPlayerSelectedGroupActor);
}

function initReset() {
  let app = this;
  app.register('resetStorage', async function(storage, db) {
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
        owner_uuid: 'system',
        managers_uuid: [],
        maps_uuid: [],
      })
      let user = await modelUser.getAsync(1);
      let user2 = await modelUser.getAsync(2);
      group.creator_uuid = user.uuid;
      group.owner_uuid = user.uuid;
      await group.setOwnerAsync(user);
      await app.group.addGroupMemberAsync(group.uuid, user.uuid);
      await app.group.addGroupMemberAsync(group.uuid, user2.uuid);

      // 增加测试的团人物
      let actor = await db.models.actor_actor.getAsync(1);
      let groupActor = await db.models.group_actor.createAsync({
        actor_uuid: actor.uuid,
        actor_info: {},
        avatar: '',
        passed: false, // 测试
      })
      await groupActor.setOwnerAsync(user);
      await groupActor.setActorAsync(actor);
      await groupActor.setGroupAsync(group);
    }catch(err) {
      throw new Error(err);
    }
  })
}
