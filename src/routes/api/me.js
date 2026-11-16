/**
 * send initial data to player
 */

import getMe from '../../core/me.js';

export default async (req, res) => {
  const { ip, user, lang } = req;
  const userdata = await getMe(user, ip, lang);

  res.json(userdata);
};
