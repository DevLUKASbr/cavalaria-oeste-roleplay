import { edgeApi, edgeEnvironment } from '../_shared/router.mjs';

Deno.serve(request => edgeApi(request, edgeEnvironment(name => Deno.env.get(name))));
