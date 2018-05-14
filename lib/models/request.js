const uuid = require('uuid/v1');

module.exports = function Request(orm, db) {
  let Request = db.define('group_request', {
    uuid: {type: 'text', required: false},
    group_uuid: {type: 'text', required: true},
    from_uuid: {type: 'text', required: true},
    is_agree: {type: 'boolean', defaultValue: false},
    is_refuse: {type: 'boolean', defaultValue: false},
    createAt: {type: 'date', time: true, required: false},
    updateAt: {type: 'date', time: true},
  }, {
    validations: {
      uuid: orm.enforce.unique('uuid already taken!'),
    },
    hooks: {
      beforeCreate: function(next) {
        if (!this.uuid) {
  				this.uuid = uuid();
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
      agreeAsync: async function() {
        this.is_agree = true;
        this.is_refuse = false;
        return await this.saveAsync();
      },
      refuseAsync: async function() {
        this.is_agree = false;
        this.is_refuse = true;
        return await this.saveAsync();
      },
    }
  });

  return Request;
}
