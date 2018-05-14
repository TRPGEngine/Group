const uuid = require('uuid/v1');

module.exports = function Group(orm, db) {
  let Group = db.define('group_group', {
    uuid: {type: 'text', defaultValue: ''},
    type: {type: 'enum', values: ['group', 'channel', 'test']},
    name: {type: 'text'},
    sub_name: {type: 'text'},
    desc: {type: 'text'},
    avatar: {type: 'text'},
    creator_uuid: {type: 'text', required: true},
    owner_uuid: {type: 'text', required: true},
    managers_uuid: {type: 'object'},
    maps_uuid: {type: 'object'},
    createAt: {type: 'date'},
    updateAt: {type: 'date'},
  }, {
    hooks: {
      beforeCreate: function(next) {
        if (!this.uuid) {
  				this.uuid = uuid();
  			}
        if (!this.managers_uuid) {
  				this.managers_uuid = [];
  			}
        if (!this.maps_uuid) {
  				this.maps_uuid = [];
  			}
        if (!this.createAt) {
  				this.createAt = new Date();
  			}
        if (!this.updateAt) {
  				this.updateAt = new Date();
  			}
  			return next();
      },
      beforeSave: function(next) {
				this.updateAt = new Date();
        return next();
      },
    },
    methods: {
      isManagerOrOwner: function(uuid) {
        if(this.creator_uuid === uuid || this.owner_uuid === uuid || this.managers_uuid.indexOf(uuid) >= 0) {
          return true;
        }else {
          return false;
        }
      },
      getManagerUUIDs: function() {
        return Array.from(new Set([this.owner_uuid].concat(this.managers_uuid)));
      },
    }
  });

  let User = db.models.player_user;
  if(!!User) {
    Group.hasOne('owner', User);
    Group.hasMany('members', User, { selected_group_actor_uuid: String }, { reverse: 'groups', key: true});
  }

  return Group;
}
