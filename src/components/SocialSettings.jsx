/*
 * Change Mail Form
 */
import { useRef, useState } from 'preact/hooks';
import { memo } from 'preact/compat';
import {
  useSelector, shallowEqual, useDispatch,
} from '../store/react-redux/index.js';
import { RiSave3Line } from 'react-icons/ri';
import { IoTrashOutline } from 'react-icons/io5';
import { t } from 'ttag';

import DeleteList from './DeleteList.jsx';

import {
  setUserBlock, changeProfile, changeUser,
} from '../store/actions/thunks.js';
import useProfile from './hooks/useProfile.js';
import { selectIsDarkMode } from '../store/selectors/gui.js';
import SettingsItem from './SettingsItem.jsx';
import FileUpload from './FileUpload.jsx';
import Avatar from './Avatar.jsx';

const selectBlocks = (state) => [
  state.chat.blocked,
  state.user.blockDm,
  state.user.priv,
  state.user.id,
];

/* eslint-disable max-len */
const SocialSettings = ({ done }) => {
  const [
    blocked,
    blockDm,
    priv,
    userId,
  ] = useSelector(selectBlocks, shallowEqual);
  const [fetchChange, setFetchChange] = useState(false);

  const avatarId = useProfile((profile) => profile.avatarId);
  const isDarkMode = useSelector(selectIsDarkMode);
  const uploadRef = useRef();
  const dispatch = useDispatch();

  return (
    <div className="inarea">

      <div className="setitem">
        <div className="setrow">
          <h3 className="settitle">{t`Avatar`}</h3>
          <div className="little-fileupload-container">
            <Avatar uid={userId} isDarkMode={isDarkMode} avatarId={avatarId} />
            <FileUpload
              acceptedTypes="image/*"
              maxFiles={1}
              uploadRef={uploadRef}
              preflightRoute="avatarpreflight"
              uploadRoute="avatarupload"
            />
            <button
              type="button"
              onClick={async () => {
                if (!fetchChange) {
                  setFetchChange(true);
                  try {
                    await dispatch(changeProfile({ avatarId: null }, true));
                  } finally {
                    setFetchChange(false);
                  }
                }
              }}
              title={t`Clear`}
              disabled={fetchChange || avatarId === null}
            >
              <IoTrashOutline />
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!fetchChange) {
                  setFetchChange(true);
                  try {
                    const files = await uploadRef.current?.();
                    if (files?.length) {
                      await dispatch(changeProfile({
                        avatarId: files[0].mediaId,
                      }, true));
                    }
                  } finally {
                    setFetchChange(false);
                  }
                }
              }}
              title={t`Save`}
              disabled={fetchChange}
            >
              <RiSave3Line />
            </button>
          </div>
        </div>
        <div className="modaldesc">{
          t`Select your Avatar. Supported Formats: jpg, gif, png, webp`
        }</div>
        <div className="modaldivider" />
      </div>

      <SettingsItem
        title={t`Block DMs`}
        value={blockDm}
        onToggle={async () => {
          if (!fetchChange) {
            setFetchChange(true);
            await dispatch(changeUser({ blockDm: !blockDm }, true));
            setFetchChange(false);
          }
        }}
      >{t`Block all Private Messages. Enabling this will make it impossible for other users to start messaging you. You can still start new DMs with other users and already ongoing DMs will still be open.`}</SettingsItem>
      <SettingsItem
        title={t`Private`}
        value={priv}
        onToggle={async () => {
          if (!fetchChange) {
            setFetchChange(true);
            await dispatch(changeUser({ priv: !priv }, true));
            setFetchChange(false);
          }
        }}
      >{t`Don't show me in global stats`}</SettingsItem>
      <h3
        style={{
          textAlign: 'left',
          marginLeft: 10,
        }}
      >{t`Unblock Users`}</h3>
      {
        (blocked.length) ? (
          <DeleteList
            list={blocked}
            callback={async (id, name) => {
              if (!fetchChange) {
                setFetchChange(true);
                dispatch(setUserBlock(id, name, false));
                setFetchChange(false);
              }
            }}
            enabled={!fetchChange}
          />
        )
          : <p>{t`You have no users blocked`}</p>
      }
      <div className="modaldivider" />
      <button
        type="button"
        onClick={done}
        style={{ margin: 10 }}
      >
        Done
      </button>
    </div>
  );
};

export default memo(SocialSettings);
