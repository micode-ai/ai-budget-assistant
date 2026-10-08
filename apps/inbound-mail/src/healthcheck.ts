/** Docker HEALTHCHECK: connect to the local SMTP port and expect a 220 banner. */
import { createConnection } from 'net';

const port = Number(process.env.PORT ?? 2525);
const socket = createConnection({ host: '127.0.0.1', port });
const fail = (): never => process.exit(1);

socket.setTimeout(4000, fail);
socket.on('error', fail);
socket.once('data', (buf) => {
  const ok = buf.toString('latin1').startsWith('220');
  socket.end('QUIT\r\n');
  process.exit(ok ? 0 : 1);
});
