import { categoryPushRef } from '../categoryPushRef';

const ID = '3f1c2b7a-9d4e-4c1a-8b2f-5e6d7c8a9b01';

describe('categoryPushRef', () => {
  it('sends nothing when there is no category', () => {
    expect(categoryPushRef(undefined, null)).toEqual({});
    expect(categoryPushRef(null, { name: 'Salary' })).toEqual({});
  });

  it('sends the id first and the name only as its fallback', () => {
    expect(categoryPushRef(ID, { name: 'Salary' })).toEqual({ categoryId: ID, categoryName: 'Salary' });
  });

  it('keeps a seeded default id on the name, which is all the server can match', () => {
    expect(categoryPushRef('default-inc-salary', { name: 'Salary' })).toEqual({ categoryId: 'Salary' });
  });

  it('sends the raw id when the category is not known locally', () => {
    expect(categoryPushRef(ID, null)).toEqual({ categoryId: ID });
    expect(categoryPushRef(ID, { name: '' })).toEqual({ categoryId: ID });
  });
});
