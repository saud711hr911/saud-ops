import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, onSnapshot, doc, setDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { encrypt } from '../lib/encryption';
import { VaultItem } from '../types';
import { Lock, Save, Trash2, Plus } from 'lucide-react';

interface Props {
  clientId: string;
  clientName: string;
}

export const ClientVaultManager: React.FC<Props> = ({ clientId, clientName }) => {
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [newPlatform, setNewPlatform] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    const q = query(collection(db, `clients/${clientId}/vault`), orderBy('platformName'));
    return onSnapshot(q, (snapshot) => {
      const items: VaultItem[] = [];
      snapshot.forEach(doc => {
        items.push({ vaultId: doc.id, ...doc.data() } as VaultItem);
      });
      setVaultItems(items);
    });
  }, [clientId]);

  const handleSaveItem = async () => {
    if (!newPlatform || !newUsername || !newPassword) return;
    const vaultId = crypto.randomUUID();
    const encryptedPassword = await encrypt(newPassword);
    await setDoc(doc(db, `clients/${clientId}/vault`, vaultId), {
      platformName: newPlatform,
      username: newUsername,
      password: encryptedPassword,
      updatedAt: new Date().toISOString(),
      updatedBy: 'Admin'
    });
    setNewPlatform('');
    setNewUsername('');
    setNewPassword('');
  };

  return (
    <div className="space-y-4 bg-white p-4 rounded-xl border border-gray-100">
      <h3 className="font-bold text-sm text-gray-800 flex items-center gap-2">
        <Lock className="w-4 h-4 text-gray-500" />
        Credentials Vault: {clientName}
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <input placeholder="Platform Name" value={newPlatform} onChange={e => setNewPlatform(e.target.value)} className="text-xs p-2 border rounded" />
        <input placeholder="Username" value={newUsername} onChange={e => setNewUsername(e.target.value)} className="text-xs p-2 border rounded" />
        <input type="password" placeholder="Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="text-xs p-2 border rounded" />
        <button onClick={handleSaveItem} className="bg-blue-600 text-white rounded p-2 text-xs font-bold flex items-center justify-center gap-1">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {vaultItems.map(item => (
          <div key={item.vaultId} className="flex justify-between items-center text-xs p-2 bg-gray-50 rounded">
            <span>{item.platformName}: {item.username}</span>
            <span className="font-mono text-gray-500">********</span>
          </div>
        ))}
      </div>
    </div>
  );
};
