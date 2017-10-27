const uuid = require('uuid/v1');

module.exports = function GroupActor(orm, db) {
  let GroupActor = db.define('group_actor', {
    uuid: {type: 'text'},
    actor_uuid: {type: 'text'},
    actor_info: {type: 'object'},
    avatar: {type: 'text'},
    passed: {type: 'boolean', defaultValue: false},
    enabled: {type: 'boolean', defaultValue: true},
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
          actor_info: this.actor_info,
          avatar: this.avatar,
          passed: this.passed,
          enabled: this.enabled,
          createAt: this.createAt,
          updateAt: this.updateAt,
          actor: actor,
        }
      }
    }
  });

  let User = db.models.player_user;
  if(!!User) {
    GroupActor.hasOne('owner', User, { reverse: "groupActors" });
  }
  let Actor = db.models.actor_actor;
  if(!!Actor) {
    GroupActor.hasOne('actor', Actor, { reverse: "groupActors" });
  }
  let Group = db.models.group_group;
  GroupActor.hasOne('group', Group, { reverse: "groupActors" });

  return GroupActor;
}
