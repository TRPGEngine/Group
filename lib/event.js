const debug = require('debug')('trpg:component:group:event');
const uuid = require('uuid/v1');

exports.create = function create(data, cb) {
  let app = this.app;
  let socket = this.socket;

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
                desc: data.desc,
                avatar: data.avatar,
                creator_uuid: user.uuid,
                owner_uuid: user.uuid,
                managers_uuid: [],
                maps_uuid: [],
              }, function(err, group) {
                if(!!err) {
                  cb({result: false, msg: err});
                }else {
                  group.setOwner(user, function(err) {
                    db.close();
                  });
                  cb({result: true, group});
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
  let app = this.app;
  let socket = this.socket;

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

exports.sendGroupInvite = async function sendGroupInvite(data, cb) {
  let app = this.app;
  let socket = this.socket;

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
    let group = db.models.group_group.one({uuid: group_uuid});
    if(!group) {
      cb({result: false, msg: '该团不存在'});
      db.close();
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
        // let to_player = app.player.list.get(to_uuid);
        // if(!!to_player) {
        //   let socket = to_player.socket;
        //   socket.emit('group::invite', invite)
        // }

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
  }catch(err) {
    debug('send group invite fail. received data %o \n%O', data, e);
    cb({result: false, msg: e.toString()})
  }
}

exports.refuseGroupInvite = function refuseGroupInvite(data, cb) {
  let app = this.app;
  let socket = this.socket;

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
  let app = this.app;
  let socket = this.socket;

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

    app.group.addGroupMember(groupUUID, playerUUID, function(err) {
      if(!!err) {
        cb({result: false, msg: '添加群组的过程中失败'});
      }else {
        cb({result: true, res: invite, group})
      }
    })
  }catch(err) {
    cb({result: false, msg: err});
    debug('agree group invite fail. received data %o \n%O', data, e);
  }
}

exports.getGroupInvite = function getGroupInvite(data, cb) {
  let app = this.app;
  let socket = this.socket;

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

exports.getGroupList = async function getGroupList(data, cb) {
  let app = this.app;
  let socket = this.socket;
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
    let user = player.user;
    let groups = await user.getGroupsAsync();
    for (let g of groups) {
      if(!Array.isArray(g.managers_uuid)) {
        g.managers_uuid = [];
      }
      if(g.managers_uuid.indexOf(g.owner_uuid) === -1) {
        g.managers_uuid.push(g.owner_uuid);
      }
    }
    cb({result: true, groups});
  }catch(e) {
    cb({result: false, msg: e});
    debug('get group list failed: received %o\n%O', data, e);
  }
}

exports.getGroupMembers = async function getGroupMembers(data, cb) {
  let app = this.app;
  let socket = this.socket;

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
    cb({result: true, members});
    db.close();
  } catch (e) {
    cb({result: false, msg: e.toString()});
  }
}

exports.getGroupActors = async function getGroupActors(data, cb) {
  let app = this.app;
  let socket = this.socket;
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

exports.addGroupActor = async function addGroupActor(data, cb) {
  let app = this.app;
  let socket = this.socket;
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
    let actorUUID = data.actorUUID;
    if(!groupUUID || !actorUUID) {
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
    let actor = await db.models.actor_actor.oneAsync({uuid: actorUUID});
    if(!actor) {
      cb({result: false, msg: '找不到该角色'})
      db.close();
      return;
    }
    let groupActor = await db.models.group_actor.createAsync({
      actor_uuid: actorUUID,
      actor_info: {},
      avatar: '',
    });
    groupActor = await groupActor.setOwnerAsync(player.user);
    groupActor = await groupActor.setActorAsync(actor);
    groupActor = await groupActor.setGroupAsync(group);
    cb({result: true, groupActor});
    db.close();
  }catch(e) {
    cb({result: false, msg: e.toString()});
  }
}

exports.sendGroupActorCheck = async function sendGroupActorCheck() {
  let app = this.app;
  let socket = this.socket;

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
    let actorUUID = data.actorUUID;
    if(!groupUUID || !actorUUID) {
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
    let actor = await db.models.actor_actor.oneAsync({uuid: actorUUID});
    if(!actor) {
      cb({result: false, msg: '找不到该角色'});
      db.close();
      return;
    }
    // 创建团人物审批
    let groupActorCheck = await db.models.group_actor_check.createAsync({
      actor_uuid: actorUUID,
      is_agree: false,
    });
    groupActorCheck = await groupActorCheck.setOwnerAsync(player.user);
    groupActorCheck = await groupActorCheck.setActorAsync(actor);
    groupActorCheck = await groupActorCheck.setGroupAsync(group);
    cb({result: true, check: groupActorCheck});
    db.close();
  } catch (e) {
    cb({result: false, msg: e.toString()});
  }
}
