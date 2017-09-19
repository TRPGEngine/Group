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
              return;
            }

            if(!!isExist) {
              cb({result: false, msg: '该团名已存在'});
            }else {
              Group.create({
                uuid: uuid(),
                type: 'group',
                name: groupName,
                avatar: data.avatar,
                creator_uuid: user.uuid,
                managers_uuid: [],
                members_uuid: [],
                maps_uuid: [],
              }, function(err, group) {
                if(!!err) {
                  cb({result: false, msg: err});
                }else {
                  group.setOwner(user, function(err) {});
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
      })
    })
  }catch(e) {
    debug('get info failed: received %o\n%O', data, e);
  }
}

exports.sendGroupInvite = function sendGroupInvite(data, cb) {
  let app = this.app;
  let socket = this.socket;

  try {
    let player = app.player.list.find(socket);
    if(!!player) {
      let group_uuid = data.group_uuid;
      let from_uuid = player.user.uuid;
      let to_uuid = data.to_uuid;
      if(from_uuid === to_uuid) {
        cb({result: false, msg: '你不能邀请自己'});
      }

      app.storage.connect(function(db) {
        const Group = db.models.group_group;
        Group.one({uuid: group_uuid}, function(err, group) {
          if(!!err) {
            cb({result: false, msg: '该团不存在'});
            return;
          }

          if(!group.isManagerOrOwner(from_uuid)) {
            cb({result: false, msg: '抱歉您不是该团管理员没有邀请权限'});
          }else {
            const Invite = db.models.group_invite;
            Invite.exists({
              group_uuid,
              from_uuid,
              to_uuid,
              is_agree: false,
              is_refuse: false
            }, function(err, inviteIsExist) {
              if(!inviteIsExist) {
                Invite.create({group_uuid, from_uuid, to_uuid}, function(err, invite) {
                  if(!!err) {
                    cb({result: false, msg: err.toString()})
                  }else{
                    let to_player = app.player.list.get(to_uuid);
                    if(!!to_player) {
                      let socket = to_player.socket;
                      socket.emit('group::invite', invite)
                    }

                    cb({result: true, invite});
                  }
                })
              }else {
                cb({result: false, msg: '重复请求'});
              }
            })
          }
        })
      });
    }else {
      cb({result: false, msg: '用户状态异常'});
    }
  }catch(err) {
    debug('send group invite fail. received data %o \n%O', data, e);
  }
}
