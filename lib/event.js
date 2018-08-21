const debug = require('debug')('trpg:component:group:event');
const uuid = require('uuid/v4');

exports.create = function create(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    if(!!app.player) {
      let groupName = data.name;
      if(!groupName) {
        cb({result: false, msg: '缺少团名'});
        return;
      }

      let player = app.player.list.find(socket);
      if(!!player) {
        let user = player.user;
        app.storage.connect(function(db) {
          const Group = db.models.group_group;
          Group.exists({name: groupName}, function(err, isExist) {
            if(!!err) {
              debug('create err:\n%O', err);
              cb({result: false, msg: err});
              db.close();
              return;
            }

            if(!!isExist) {
              cb({result: false, msg: '该团名已存在'});
              db.close();
            }else {
              Group.create({
                uuid: uuid(),
                type: 'group',
                name: groupName,
                sub_name: data.subname,
                desc: data.desc,
                avatar: data.avatar,
                creator_uuid: user.uuid,
                owner_uuid: user.uuid,
                managers_uuid: [],
                maps_uuid: [],
              }, function(err, group) {
                if(!!err) {
                  cb({result: false, msg: err});
                  db.close();
                }else {
                  group.setOwner(user, function(err) {
                    app.group.addGroupMember(group.uuid, user.uuid, function() {
                      cb({result: true, group});
                      db.close();
                    })
                  });
                }
              })
            }
          });
        })
      }else {
        cb({result: false, msg: '发生异常，无法获取到用户信息，请检查您的登录状态'})
      }
    }else {
      throw new Error('[GroupComponent] require component [PlayerComponent]');
    }
  }catch(e) {
    debug('create group failed: received %o\n%O', data, e);
  }
}

exports.getInfo = function getInfo(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    let uuid = data.uuid;
    if(!uuid) {
      cb({result:false, msg: '缺少参数'});
      return;
    }
    app.storage.connect(function(db) {
      const Group = db.models.group_group;
      Group.one({uuid}, function(err, group) {
        if(!!err) {
          cb({result:false, msg: err.toString()})
        }else {
          cb({result: true, group})
        }
        db.close();
      })
    })
  }catch(e) {
    debug('get info failed: received %o\n%O', data, e);
  }
}

exports.updateInfo = async function updateInfo(data, cb, db) {
  let {app, socket} = this;

  if(!app.player) {
    debug('[GroupComponent] need [PlayerComponent]');
    return;
  }
  let player = app.player.list.find(socket);
  if(!player) {
    throw '用户不存在，请检查登录状态';
  }

  let {groupUUID, groupInfo} = data;
  if(!groupUUID || !groupInfo) {
    throw '缺少参数';
  }

  let group = await db.models.group_group.oneAsync({uuid: groupUUID});
  if(!group) {
    throw '找不到团';
  }
  if(!group.isManagerOrOwner(player.uuid)) {
    throw '没有修改权限';
  }

  // IDEA: 为防止意外暂时只允许修改下列属性
  let info = {
    avatar: groupInfo.avatar,
    name: groupInfo.name,
    sub_name: groupInfo.sub_name,
    desc: groupInfo.desc,
  }
  for (let key in info) {
    if(info[key] !== undefined) {
      group[key] = info[key];
    }
  }

  await group.saveAsync();
  return { group };
}

exports.findGroup = async function findGroup(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }

    let {text, type} = data;
    if(!text || !type) {
      cb({result: false, msg: '缺少参数'});
      return;
    }

    let db = await app.storage.connectAsync();
    let results = [];
    if(type === 'uuid') {
      results = await db.models.group_group.findAsync({uuid: text}, 10);
    }else if(type === 'groupname') {
      results = await db.models.group_group.find().limit(10).where(`name like '%${text}%'`).findAsync();
    }else if(type === 'groupdesc') {
      results = await db.models.group_group.find().limit(10).where(`desc like '%${text}%'`).findAsync();
    }

    cb({result: true, results});
    db.close();
  }catch(err) {
    cb({result: false, msg: err});
    debug('agree group invite fail. received data %o \n%O', data, err);
  }
}

exports.requestJoinGroup = async function requestJoinGroup(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户状态异常'});
      return;
    }

    let from_uuid = player.user.uuid;
    let { group_uuid } = data;
    if(!group_uuid) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }

    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: group_uuid});
    if(!group) {
      cb({result: false, msg: '该团不存在'});
      db.close();
      return;
    }

    // 检测该用户是否已加入团
    let groupMembers = await group.getMembersAsync();
    if(groupMembers.indexOf(from_uuid) >= 0) {
      cb({result: false, msg: '您已加入该团'});
      db.close();
      return;
    }

    // 检测团加入申请是否存在
    let requestIsExist = await db.models.group_request.existsAsync({
      group_uuid,
      from_uuid,
      is_agree: false,
      is_refuse: false
    });
    if(!!requestIsExist) {
      cb({result: false, msg: '重复请求'});
      db.close();
      return;
    }

    // 添加团邀请
    let groupRequest = await db.models.group_request.createAsync({
      group_uuid,
      from_uuid,
      is_agree: false,
      is_refuse: false
    });

    // 向管理员发送系统信息
    if(app.chat) {
      let managers = group.getManagerUUIDs();
      let user = await db.models.player_user.oneAsync({uuid: from_uuid});
      for (let muuid of managers) {
        let systemMsg = `${user.nickname || user.username} 想加入您的团 [${group.name}]`;
        app.chat.sendSystemMsg(muuid, 'groupRequest', '入团申请', systemMsg, {requestUUID: groupRequest.uuid, groupUUID: group_uuid, fromUUID: from_uuid})
      }
    }else {
      console.warn('[GroupComponent] need [ChatComponent] to send system msg');
    }

    cb({result: true, request: groupRequest});
    db.close();
  }catch(e) {
    cb({result: false, msg: e.toString()})
  }
}

exports.agreeGroupRequest = async function agreeGroupRequest(data, cb, db) {
  const app = this.app;
  const socket = this.socket;

  let player = app.player.list.find(socket);
  if(!player) {
    throw '用户状态异常';
  }

  let { request_uuid } = data;
  if(!request_uuid) {
    throw '缺少必要参数';
  }

  let request = await db.models.group_request.oneAsync({uuid: request_uuid});
  if(!request) {
    throw '找不到该入团申请';
  }
  if(request.is_agree === true) {
    throw '已同意该请求';
  }

  let group_uuid = request.group_uuid;
  let group = await db.models.group_group.oneAsync({uuid: group_uuid});
  if(!group) {
    throw '找不到该团';
  }

  await request.agreeAsync();

  // 发送入团成功消息
  let systemMsg = `管理员 ${player.user.getName()} 已同意您加入团 [${group.name}] ,和大家打个招呼吧!`;
  app.chat.sendSystemMsg(request.from_uuid, 'groupRequestSuccess', '入团成功', systemMsg, {groupUUID: group_uuid});
  await app.group.addGroupMemberAsync(group_uuid, request.from_uuid);

  let members = await group.getMembersAsync();
  let members_uuid = members.map((i) => i.uuid);
  return {
    groupUUID: group.uuid,
    members: members_uuid
  }
}

exports.refuseGroupRequest = async function refuseGroupRequest(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户状态异常'});
      return;
    }

    let { request_uuid } = data;
    if(!request_uuid) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }

    let db = await app.storage.connectAsync();
    let request = await db.models.group_request.oneAsync({uuid: request_uuid});
    if(!request) {
      cb({result: false, msg: '找不到该入团申请'});
      db.close();
      return;
    }
    if(request.is_agree === true) {
      cb({result: true});
      db.close();
      return;
    }

    let group_uuid = request.group_uuid;
    let group = await db.models.group_group.oneAsync({uuid: group_uuid});
    if(!group) {
      cb({result: false, msg: '找不到该团'});
      db.close();
      return;
    }

    await request.refuseAsync();
    cb({result: true});
    db.close();

    let systemMsg = `管理员 ${player.user.getName()} 已拒绝您加入团 ${group.name}, 请等待其他管理员的验证。`;
    app.chat.sendSystemMsg(request.from_uuid, 'groupRequestFail', '入团被拒', systemMsg, {groupUUID: group_uuid});
  }catch(e) {
    cb({result: false, msg: e.toString()})
  }
}

exports.sendGroupInvite = async function sendGroupInvite(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户状态异常'});
      return;
    }

    let group_uuid = data.group_uuid;
    let from_uuid = player.user.uuid;
    let to_uuid = data.to_uuid;
    if(from_uuid === to_uuid) {
      cb({result: false, msg: '你不能邀请自己'});
      return;
    }

    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: group_uuid});
    if(!group) {
      cb({result: false, msg: '该团不存在'});
      db.close();
      return;
    }

    if(!group.isManagerOrOwner(from_uuid)) {
      cb({result: false, msg: '抱歉您不是该团管理员没有邀请权限'});
      db.close();
    }else {
      let inviteIsExist = await db.models.group_invite.existsAsync({
        group_uuid,
        from_uuid,
        to_uuid,
        is_agree: false,
        is_refuse: false
      });
      if(inviteIsExist) {
        cb({result: false, msg: '重复请求'});
        db.close();
      }else {
        let invite = await db.models.group_invite.createAsync({group_uuid, from_uuid, to_uuid});
        let to_player = app.player.list.get(to_uuid);
        if(!!to_player) {
          let socket = to_player.socket;
          socket.emit('group::invite', invite)
        }

        if(app.chat && app.chat.sendMsg) {
          // 发送系统信息
          let msg = `${player.user.nickname||player.user.username} 想邀请您加入团 ${group.name}`;
          app.chat.sendMsg('trpgsystem', to_uuid, {
            message: msg,
            type: 'card',
            data: {
              title: '入团邀请',
              type: 'groupInvite',
              content: msg,
              invite,
            },
          });
        }

        cb({result: true, invite});
        db.close();
      }
    }
  }catch(e) {
    debug('send group invite fail. received data %o \n%O', data, e);
    cb({result: false, msg: e.toString()})
  }
}

exports.refuseGroupInvite = function refuseGroupInvite(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    let player = app.player.list.find(socket);
    if(!!player) {
      let playerUUID = player.uuid;
      let inviteUUID = data.uuid;
      app.storage.connect(function(db) {
        const Invite = db.models.group_invite;
        Invite.one({uuid: inviteUUID, to_uuid: playerUUID}, function(err, invite) {
          if(!!err) {
            debug('refuseGroupInvite failed: %O', err);
            cb({result: false, msg: '拒绝失败'});
            db.close();
          }else {
            if(!!invite) {
              invite.is_refuse = true;
              invite.save(function (err) {
                if(!!err) {
                  debug('refuseGroupInvite save data failed: %O', err);
                  cb({result: false, msg: '拒绝失败'});
                }else {
                  cb({result: true, res: invite});
                }
                db.close();
              })
            }else {
              console.warn({uuid: inviteUUID, to_uuid: playerUUID});
              cb({result: false, msg: '拒绝失败: 该请求不存在'});
              db.close();
            }
          }
        })
      })
    }else {
      cb({result: false, msg: '用户状态异常'});
    }
  }catch(err) {
    debug('refuse group invite fail. received data %o \n%O', data, e);
  }
}

exports.agreeGroupInvite = async function agreeGroupInvite(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }

    let playerUUID = player.uuid;
    let inviteUUID = data.uuid;

    let db = await app.storage.connectAsync();
    let invite = await db.models.group_invite.oneAsync({uuid: inviteUUID, to_uuid: playerUUID});
    invite.is_agree = true;
    invite = await invite.saveAsync();
    let groupUUID = invite.group_uuid;
    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    if(!group) {
      cb({result: false, msg: '该团不存在'});
      db.close();
      return;
    }
    db.close();

    await app.group.addGroupMemberAsync(groupUUID, playerUUID);
    invite.group = group;
    cb({result: true, res: invite})
  }catch(err) {
    cb({result: false, msg: err});
    debug('agree group invite fail. received data %o \n%O', data, e);
  }
}

exports.getGroupInvite = function getGroupInvite(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    let player = app.player.list.find(socket);
    if(!!player) {
      let uuid = player.user.uuid;
      app.storage.connect(function(db) {
        const Invite = db.models.group_invite;
        Invite.find({
          to_uuid: uuid,
          is_agree: false,
          is_refuse: false
        }, function(err, res) {
          if(!!err) {
            debug('getGroupInvite Error: %O', err);
            cb({result: false, msg: '数据库异常'});
          }else {
            cb({result: true, res});
          }
          db.close();
        })
      });
    }else {
      cb({result: false, msg: '用户状态异常'});
    }
  }catch(err) {
    debug('get group invite fail. received data %o \n%O', data, e);
  }
}

exports.getGroupList = async function getGroupList(data, cb, db) {
  const app = this.app;
  const socket = this.socket;
  if(!app.player) {
    debug('[GroupComponent] need [PlayerComponent]');
    return;
  }

  let player = app.player.list.find(socket);
  if(!player) {
    throw '用户不存在，请检查登录状态';
  }

  let user = await db.models.player_user.oneAsync({uuid: player.uuid});
  let groups = await user.getGroupsAsync();
  return {groups}
}

exports.getGroupMembers = async function getGroupMembers(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    if(!app.player) {
      debug('[GroupComponent] need [PlayerComponent]');
      return;
    }
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }
    let groupUUID = data.groupUUID;
    if(!groupUUID) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }

    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    let members = await group.getMembersAsync();
    members = members.map((i) => Object.assign({}, i.getInfo(), i.extra));
    cb({result: true, members});
    db.close();
  } catch (e) {
    cb({result: false, msg: e.toString()});
  }
}

exports.getGroupActors = async function getGroupActors(data, cb) {
  const app = this.app;
  const socket = this.socket;
  try {
    if(!app.player) {
      debug('[GroupComponent] need [PlayerComponent]');
      return;
    }
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }

    let groupUUID = data.groupUUID;
    if(!groupUUID) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }
    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    if(!group) {
      cb({result: false, msg: '找不到团信息'});
      return;
    }
    let groupActors = await group.getGroupActorsAsync();
    let res = [];
    for (let ga of groupActors) {
      res.push(await ga.getObjectAsync());
    }
    cb({result: true, actors: res});
    db.close();
  } catch (e) {
    cb({result: false, msg: e.toString()});
  }
}

exports.addGroupActor = async function addGroupActor(data, cb, db) {
  const app = this.app;
  const socket = this.socket;

  if(!app.player) {
    debug('[GroupComponent] need [PlayerComponent]');
    return;
  }
  let player = app.player.list.find(socket);
  if(!player) {
    throw '用户不存在，请检查登录状态';
  }

  let groupUUID = data.groupUUID;
  let actorUUID = data.actorUUID;
  if(!groupUUID || !actorUUID) {
    throw '缺少必要参数';
  }
  let group = await db.models.group_group.oneAsync({uuid: groupUUID});
  if(!group) {
    throw '找不到团';
  }
  let actor = await db.models.actor_actor.oneAsync({uuid: actorUUID});
  if(!actor) {
    throw '找不到该角色';
  }
  let isGroupActorExist = await db.models.group_actor.existsAsync({actor_uuid: actor.uuid, group_id: group.id});
  if(isGroupActorExist) {
    throw '该角色已存在';
  }

  let groupActor;
  await db.transactionAsync(async () => {
    groupActor = await db.models.group_actor.createAsync({
      actor_uuid: actorUUID,
      actor_info: {},
      avatar: '',
      passed: false,
      owner_id: player.user.id,
    });
    groupActor = await groupActor.setActorAsync(actor);
    groupActor = await groupActor.setGroupAsync(group);
  })

  return {groupActor};
}

exports.removeGroupActor = async function (data, cb, db) {
  const app = this.app;
  const socket = this.socket;

  try {
    if(!app.player) {
      debug('[GroupComponent] need [PlayerComponent]');
      return;
    }
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }

    let groupUUID = data.groupUUID;
    let groupActorUUID = data.groupActorUUID;
    if(!groupUUID || !groupActorUUID) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }

    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    if(!group) {
      cb({result: false, msg: '找不到团'});
      return;
    }

    // 检测权限
    if(!group.isManagerOrOwner(player.uuid)) {
      cb({result: false, msg: '权限不足'});
      return;
    }

    let isGroupActorExist = await db.models.group_actor.existsAsync({uuid: groupActorUUID, group_id: group.id});
    if(!isGroupActorExist) {
      cb({result: false, msg: '该角色不存在'});
      return;
    }

    // 清空选择角色
    await db.transactionAsync(async function() {
      await db.models.group_actor.find({uuid: groupActorUUID, group_id: group.id}).removeAsync();

      let members = await group.getMembersAsync();
      for (let i = 0; i < members.length; i++) {
        if(members[i].selected_group_actor_uuid === groupActorUUID) {
          members[i].extra.selected_group_actor_uuid = null;
          await members[i].saveAsync();
        }
      }
    })

    cb({result: true});
  } catch (e) {
    cb({result: false, msg: e.toString()});
  }
};

exports.agreeGroupActor = async function refuseGroupActor(data, cb) {
  const app = this.app;
  const socket = this.socket;
  try {
    if(!app.player) {
      debug('[GroupComponent] need [PlayerComponent]');
      return;
    }
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }

    let groupUUID = data.groupUUID;
    let groupActorUUID = data.groupActorUUID;
    if(!groupUUID || !groupActorUUID) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }
    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    if(!group) {
      cb({result: false, msg: '找不到团'})
      db.close();
      return;
    }
    if(!group.isManagerOrOwner(player.user.uuid)) {
      cb({result: false, msg: '没有操作权限'})
      db.close();
      return;
    }
    let groupActor = await db.models.group_actor.oneAsync({uuid: groupActorUUID, passed: false});
    if(!groupActor) {
      cb({result: false, msg: '找不到该角色'})
      db.close();
      return;
    }
    groupActor.passed = true;
    await groupActor.saveAsync();
    cb({result: true, groupActor});
    db.close();
  }catch(e) {
    cb({result: false, msg: e.toString()});
  }
}

exports.refuseGroupActor = async function refuseGroupActor(data, cb) {
  const app = this.app;
  const socket = this.socket;
  try {
    if(!app.player) {
      debug('[GroupComponent] need [PlayerComponent]');
      return;
    }
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }

    let groupUUID = data.groupUUID;
    let groupActorUUID = data.groupActorUUID;
    if(!groupUUID || !groupActorUUID) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }
    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    if(!group) {
      cb({result: false, msg: '找不到团'})
      db.close();
      return;
    }
    if(!group.isManagerOrOwner(player.user.uuid)) {
      cb({result: false, msg: '没有操作权限'})
      db.close();
      return;
    }
    let groupActor = await db.models.group_actor.oneAsync({uuid: groupActorUUID, passed: false});
    if(!groupActor) {
      cb({result: false, msg: '找不到该角色'})
      db.close();
      return;
    }
    await groupActor.removeAsync();
    cb({result: true});
    db.close();
  }catch(e) {
    cb({result: false, msg: e.toString()});
  }
}

exports.updateGroupActorInfo = async function updateGroupActorInfo(data, cb, db) {
  const app = this.app;
  const socket = this.socket;

  if(!app.player) {
    debug('[GroupComponent] need [PlayerComponent]');
    return;
  }
  let player = app.player.list.find(socket);
  if(!player) {
    throw '用户不存在，请检查登录状态';
  }

  let groupUUID = data.groupUUID;
  let groupActorUUID = data.groupActorUUID;
  let groupActorInfo = data.groupActorInfo;
  if(!groupUUID || !groupActorUUID || !groupActorInfo) {
    throw '缺少必要参数';
  }

  let group = await db.models.group_group.oneAsync({uuid: groupUUID});
  if(!group) {
    throw '找不到团';
  }
  if(!group.isManagerOrOwner(player.uuid)) {
    throw '没有修改权限';
  }
  let groupActor = await db.models.group_actor.oneAsync({group_id: group.id, uuid: groupActorUUID});
  if(!groupActor) {
    throw '找不到团角色';
  }
  groupActor.actor_info = groupActorInfo;
  await groupActor.saveAsync();
  return true;
}

exports.setPlayerSelectedGroupActor = async function setPlayerSelectedGroupActor(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    if(!app.player) {
      debug('[GroupComponent] need [PlayerComponent]');
      return;
    }
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }

    let groupUUID = data.groupUUID;
    let groupActorUUID = data.groupActorUUID; // 可以为null 即取消选择
    if(!groupUUID) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }

    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    if(!group) {
      cb({result: false, msg: '找不到团'})
      db.close();
      return;
    }
    let members = await group.getMembersAsync();
    let isSave = false;
    for (let member of members) {
      if(member.uuid === player.user.uuid) {
        member.extra.selected_group_actor_uuid = groupActorUUID;
        await member.saveAsync();
        isSave = true;
        break;
      }
    }
    if(isSave) {
      cb({result: true, data: {groupUUID, groupActorUUID}});
    }else {
      cb({result: false, msg: '没有找到复合条件的团员'});
    }
    db.close();
  }catch(e) {
    cb({result: false, msg: e.toString()});
  }
}

exports.getPlayerSelectedGroupActor = async function getPlayerSelectedGroupActor(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    if(!app.player) {
      debug('[GroupComponent] need [PlayerComponent]');
      return;
    }
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }
    let groupUUID = data.groupUUID;
    let groupMemberUUID = data.groupMemberUUID;
    if(!groupUUID || !groupMemberUUID) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }

    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    if(!group) {
      cb({result: false, msg: '找不到团'});
      db.close();
      return;
    }
    let members = await group.getMembersAsync();
    let playerSelectedGroupActor;
    for (let member of members) {
      if(member.uuid === groupMemberUUID) {
        playerSelectedGroupActor = {
          groupMemberUUID,
          selectedGroupActorUUID: member.extra.selected_group_actor_uuid,
        }
        break;
      }
    }
    if(playerSelectedGroupActor) {
      cb({result: true, playerSelectedGroupActor})
    }else {
      cb({result: false, msg: '没有找到复合条件的团员'});
    }
    db.close();
  }catch(e) {
    cb({result: false, msg: e.toString()});
  }
}

// 退出团
exports.quitGroup = async function quitGroup(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    if(!app.player) {
      debug('[GroupComponent] need [PlayerComponent]');
      return;
    }
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }
    let groupUUID = data.groupUUID;
    if(!groupUUID) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }

    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    if(!group) {
      cb({result: false, msg: '找不到团'});
      db.close();
      return;
    }
    if(group.owner_uuid === player.uuid) {
      cb({result: false, msg: '作为团长你无法直接退出群'});
      db.close();
      return;
    }

    // 系统通知
    let managers_uuid = group.getManagerUUIDs();
    let systemMsg = `用户 ${player.user.getName()} 退出了团 [${group.name}]`;
    managers_uuid.forEach(uuid => {
      if(uuid !== player.user.uuid) {
        app.chat.sendSystemSimpleMsg(uuid, systemMsg);
      }
    })

    let removeMember = await group.removeMembersAsync([player.user]);
    cb({result: true, removeMember});
    db.close();
  }catch(e) {
    cb({result: false, msg: e.toString()});
  }
}

// 解散团
exports.dismissGroup = async function dismissGroup(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    if(!app.player) {
      debug('[GroupComponent] need [PlayerComponent]');
      return;
    }
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }
    let groupUUID = data.groupUUID;
    if(!groupUUID) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }

    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    if(!group) {
      cb({result: false, msg: '找不到团'});
      db.close();
      return;
    }
    if(group.owner_uuid !== player.uuid) {
      cb({result: false, msg: '你没有该权限'});
      db.close();
      return;
    }

    // 系统通知
    let members = await group.getMembersAsync();
    let systemMsg = `您的团 ${group.name} 解散了, ${members.length - 1} 只小鸽子无家可归`;
    members.forEach(member => {
      let uuid = member.uuid;
      if(uuid !== group.owner_uuid) {
        app.chat.sendSystemSimpleMsg(uuid, systemMsg);
      }
    })

    await group.removeAsync();
    cb({result: true});
    db.close();
  }catch(e) {
    cb({result: false, msg: e.toString()});
  }
}

exports.tickMember = async function tickMember(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    if(!app.player) {
      debug('[GroupComponent] need [PlayerComponent]');
      return;
    }
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }
    let groupUUID = data.groupUUID;
    let memberUUID = data.memberUUID;
    if(!groupUUID || !memberUUID) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }
    if(player.user.uuid === memberUUID) {
      cb({result: false, msg: '您不能踢出你自己'});
      return;
    }

    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    if(!group) {
      cb({result: false, msg: '找不到团'});
      db.close();
      return;
    }
    let member = await db.models.player_user.oneAsync({uuid: memberUUID});
    if(!member) {
      cb({result: false, msg: '找不到该成员'});
      db.close();
      return;
    }
    if(!group.isManagerOrOwner(player.user.uuid)) {
      // 操作人不是管理
      cb({result: false, msg: '您没有该权限'});
      db.close();
      return;
    }else if(group.isManagerOrOwner(memberUUID) && group.owner_uuid !== player.user.uuid) {
      // 被踢人是管理但操作人不是团所有人
      cb({result: false, msg: '您没有该权限'});
      db.close();
      return;
    }
    if(!await group.hasMembersAsync([member])) {
      cb({result: false, msg: '该团没有该成员'});
      db.close();
      return;
    }
    await group.removeMembersAsync([member]);
    // 发通知
    app.chat.sendSystemMsg(memberUUID, '', '', `您已被踢出团 [${group.name}]`);
    group.getManagerUUIDs().forEach(uuid => {
      app.chat.sendSystemMsg(uuid, '', '', `团成员 ${member.getName()} 已被踢出团 [${group.name}]`);
    })
    cb({result: true});
    db.close();
  }catch(e) {
    cb({result: false, msg: e.toString()});
  }
}

// 将普通用户提升为管理员
exports.setMemberToManager = async function setMemberToManager(data, cb) {
  const app = this.app;
  const socket = this.socket;

  try {
    if(!app.player) {
      debug('[GroupComponent] need [PlayerComponent]');
      return;
    }
    let player = app.player.list.find(socket);
    if(!player) {
      cb({result: false, msg: '用户不存在，请检查登录状态'});
      return;
    }
    let groupUUID = data.groupUUID;
    let memberUUID = data.memberUUID;
    if(!groupUUID || !memberUUID) {
      cb({result: false, msg: '缺少必要参数'});
      return;
    }
    if(player.user.uuid === memberUUID) {
      cb({result: false, msg: '你不能将自己提升为管理员'});
      return;
    }
    let db = await app.storage.connectAsync();
    let group = await db.models.group_group.oneAsync({uuid: groupUUID});
    if(!group) {
      cb({result: false, msg: '找不到团'});
      db.close();
      return;
    }
    let member = await db.models.player_user.oneAsync({uuid: memberUUID});
    if(!member) {
      cb({result: false, msg: '找不到该成员'});
      db.close();
      return;
    }
    if(group.owner_uuid !== player.user.uuid) {
      // 操作人不是管理
      cb({result: false, msg: '您不是团的所有者'});
      db.close();
      return;
    }
    if(group.managers_uuid.indexOf(memberUUID) >= 0) {
      // 操作人不是管理
      cb({result: false, msg: '该成员已经是团管理员'});
      db.close();
      return;
    }
    if(!await group.hasMembersAsync([member])) {
      cb({result: false, msg: '该团没有该成员'});
      db.close();
      return;
    }
    group.managers_uuid = [...group.managers_uuid, memberUUID];
    let res = await group.saveAsync();
    console.log(JSON.stringify(res));
    // 发通知
    app.chat.sendSystemMsg(memberUUID, '', '', `您已成为团 [${group.name}] 的管理员`);
    group.getManagerUUIDs().forEach(uuid => {
      app.chat.sendSystemMsg(uuid, '', '', `团成员 ${member.getName()} 已被提升为团 [${group.name}] 的管理员`);
    })
    cb({result: true, group: res});
    db.close();
  }catch(e) {
    cb({result: false, msg: e.toString()});
  }
}

// 获取团状态
exports.getGroupStatus = async function getGroupStatus(data, cb) {
  const app = this.app;
  const socket = this.socket;

  let {groupUUID} = data;
  let groupStatus = app.cache.get(`group:${groupUUID}:status`);
  return { status: Boolean(groupStatus) }
}

// 设置团状态： 开团、闭团
exports.setGroupStatus = async function setGroupStatus(data, cb, db) {
  const app = this.app;
  const socket = this.socket;

  let player = app.player.list.find(socket);
  if(!player) {
    throw '用户不存在，请检查登录状态';
  }
  let uuid = player.uuid;
  let {groupUUID, groupStatus} = data;
  groupStatus = Boolean(groupStatus);
  if(!groupUUID || groupStatus === undefined) {
    throw '缺少必要参数';
  }

  let group = await db.models.group_group.oneAsync({uuid: groupUUID});
  if(!group) {
    throw '没有找到该团';
  }
  if(!group.isManagerOrOwner(uuid)) {
    throw '没有修改团状态的权限';
  }

  app.cache.set(`group:${groupUUID}:status`, groupStatus);
  // 通知所有团成员
  socket.broadcast.to(groupUUID).emit('group::updateGroupStatus', {
    groupUUID,
    groupStatus
  });
  return true;
}
