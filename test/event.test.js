const db = global.db;
const emitEvent = global.emitEvent;
const _ = global._;
const generateRandomStr = global.generateRandomStr;

beforeAll(async () => {
  const loginInfo = await emitEvent('player::login', {
    username: 'admin1',
    password: '21232f297a57a5a743894a0e4a801fc3'
  })
  expect(loginInfo.result).toBe(true);
  this.userInfo = loginInfo.info;
})

afterAll(async () => {
  let {
    uuid,
    token
  } = this.userInfo;
  await emitEvent('player::logout', { uuid, token })
})

describe('group action', () => {
  beforeAll(async () => {
    this.testGroup = await db.models.group_group.create({
      name: 'test name' + generateRandomStr(),
      sub_name: 'test sub_name' + generateRandomStr(),
      creator_uuid: this.userInfo.uuid,
      owner_uuid: this.userInfo.uuid
    });
  })

  afterAll(async () => {
    await this.testGroup.destroy({force: true});
  })

  test('create should be ok', async () => {
    let ret = await emitEvent('group::create', {
      name: 'test group name',
      sub_name: 'test group sub_name'
    })

    expect(ret.result).toBe(true);
    expect(ret).toHaveProperty('group');
    expect(ret).toHaveProperty('group.name', 'test group name');
    expect(ret).toHaveProperty('group.uuid');

    let groupUUID = ret.group.uuid;
    await db.models.group_group.destroy({
      where: {
        uuid: groupUUID
      },
      force: true
    })
  });

  test('getInfo should be ok', async () => {
    let ret = await emitEvent('group::getInfo', {
      uuid: this.testGroup.uuid
    });

    expect(ret.result).toBe(true);
    expect(ret).toHaveProperty('group');
    expect(ret).toHaveProperty('group.uuid', this.testGroup.uuid);
  })

  test('updateInfo should be ok', async () => {
    const desc = generateRandomStr(30);
    let ret = await emitEvent('group::updateInfo', {
      groupUUID: this.testGroup.uuid,
      groupInfo: {
        desc
      }
    });

    expect(ret.result).toBe(true);
    expect(ret).toHaveProperty('group');
    expect(ret).toHaveProperty('group.uuid', this.testGroup.uuid);
    expect(ret).toHaveProperty('group.desc', desc);
  })

  test.todo('findGroup should be ok');

  test.todo('requestJoinGroup should be ok');

  test.todo('agreeGroupRequest should be ok');

  test.todo('refuseGroupRequest should be ok');

  test.todo('sendGroupInvite should be ok');
})
