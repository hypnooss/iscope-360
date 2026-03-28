// Mock Supabase Client to prevent application crashes while migrating away from Supabase
// This allows existing hooks to still call .from().select() without failing, returning empty results.

const mockQueryPromise = Promise.resolve({
  data: [],
  error: null,
  count: 0,
  status: 200,
  statusText: 'OK',
});

const mockQueryBuilder: any = {
  select: () => mockQueryBuilder,
  insert: () => mockQueryBuilder,
  update: () => mockQueryBuilder,
  upsert: () => mockQueryBuilder,
  delete: () => mockQueryBuilder,
  eq: () => mockQueryBuilder,
  neq: () => mockQueryBuilder,
  gt: () => mockQueryBuilder,
  gte: () => mockQueryBuilder,
  lt: () => mockQueryBuilder,
  lte: () => mockQueryBuilder,
  like: () => mockQueryBuilder,
  ilike: () => mockQueryBuilder,
  is: () => mockQueryBuilder,
  in: () => mockQueryBuilder,
  contains: () => mockQueryBuilder,
  containedBy: () => mockQueryBuilder,
  rangeGt: () => mockQueryBuilder,
  rangeGte: () => mockQueryBuilder,
  rangeLt: () => mockQueryBuilder,
  rangeLte: () => mockQueryBuilder,
  rangeAdjacent: () => mockQueryBuilder,
  overlaps: () => mockQueryBuilder,
  textSearch: () => mockQueryBuilder,
  match: () => mockQueryBuilder,
  not: () => mockQueryBuilder,
  or: () => mockQueryBuilder,
  filter: () => mockQueryBuilder,
  order: () => mockQueryBuilder,
  limit: () => mockQueryBuilder,
  range: () => mockQueryBuilder,
  single: () => mockQueryPromise,
  maybeSingle: () => mockQueryPromise,
  then: (onfulfilled: any) => mockQueryPromise.then(onfulfilled),
  catch: (onrejected: any) => mockQueryPromise.catch(onrejected),
};

export const supabase: any = {
  from: () => mockQueryBuilder,
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    resetPasswordForEmail: () => Promise.resolve({ error: null }),
    updateUser: () => Promise.resolve({ data: { user: null }, error: null }),
  },
  storage: {
    from: () => ({
      upload: () => Promise.resolve({ data: null, error: null }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
    }),
  },
  functions: {
    invoke: () => Promise.resolve({ data: null, error: null }),
  },
};
