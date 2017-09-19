module.exports = function Group(orm, db) {
  let Group = db.define('group_group', {
    uuid: {type: 'text', defaultValue: ''},
    type: {type: 'enum', values: ['group', 'channel', 'test']},
    name: {type: 'text'},
    avatar: {type: 'text'},
    creator_uuid: {type: 'text'},
    managers_uuid: {type: 'object', defaultValue: '[]'},
    members_uuid: {type: 'object', defaultValue: '[]'},
    maps_uuid: {type: 'object', defaultValue: '[]'},
  }, {
    hooks: {
      beforeCreate: function(next) {
        if (!this.uuid) {
  				this.uuid = uuid();
  			}
  			return next();
      }
    },
    methods: {
      isManagerOrOwner: function(uuid) {
        if(this.creator_uuid === uuid || this.managers_uuid.indexOf(uuid) >= 0) {
          return true;
        }else {
          return false;
        }
      }
    }
  });

  let User = db.models.player_user;
  if(!!User) {
    Group.hasOne('owner', User, { reverse: "pets" });
  }

  return Group;
}
