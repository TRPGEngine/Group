// 废弃
const uuid = require('uuid/v1');

module.exports = function GroupActorCheck(orm, db) {
  let GroupActorCheck = db.define('group_actor_check', {
    uuid: {type: 'text'},
    actor_uuid: {type: 'text'},
    is_agree: {type: 'boolean', defaultValue: false},
    createAt: {type: 'date'},
    updateAt: {type: 'date'},
  }, {
    hooks: {
      beforeCreate: function(next) {
        if (!this.uuid) {
  				this.uuid = uuid();
  			}
        if (!this.createAt) {
  				this.createAt = new Date().valueOf();
  			}
        if (!this.updateAt) {
  				this.updateAt = new Date().valueOf();
  			}
  			return next();
      }
    },
    methods: {
      getObjectAsync: async function() {
        let actor = await this.getActorAsync();
        return {
          uuid: this.uuid,
          actor_uuid: this.actor_uuid,
          is_agree: this.is_agree,
          createAt: this.createAt,
          updateAt: this.updateAt,
          actor: actor,
        }
      }
    }
  });

  let User = db.models.player_user;
  if(!!User) {
    GroupActorCheck.hasOne('owner', User);
  }
  let Actor = db.models.actor_actor;
  if(!!Actor) {
    GroupActorCheck.hasOne('actor', Actor);
  }
  let Group = db.models.group_group;
  GroupActorCheck.hasOne('group', Group, { reverse: "groupActorChecks" });

  return GroupActorCheck;
}
