import { ConvexHttpClient } from 'convex/browser';

const getConvexClient = () => {
  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)
}

export default getConvexClient;
