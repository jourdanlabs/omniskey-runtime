type MirrorverseFetchResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

type MirrorverseFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

declare const fetch: (input: string | URL, init?: MirrorverseFetchInit) => Promise<MirrorverseFetchResponse>;
