'use client';

import { FormEvent, useEffect, useState } from 'react';
import { adminUserService } from '@/services/adminUserService';
import type { AccountStatus, AuthUser, UserRole } from '@/services/authService';
import { getApiErrorMessage } from '@/lib/api-error';
import { Button, Card, Input } from '@/components/ui';

export default function AdminUsersPage() {
    const [users, setUsers] = useState<AuthUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<UserRole>('admin');

    const loadUsers = async () => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const result = await adminUserService.listUsers();
            setUsers(result.users);
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Cannot load users'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadUsers();
    }, []);

    const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setMessage(null);
        setErrorMessage(null);

        try {
            const result = await adminUserService.createUser({ name, email, password, role });
            setMessage(result.message);
            setName('');
            setEmail('');
            setPassword('');
            setRole('admin');
            await loadUsers();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Cannot create user'));
        }
    };

    const handleUpdateRole = async (id: number, nextRole: UserRole) => {
        setMessage(null);
        setErrorMessage(null);
        try {
            const result = await adminUserService.updateRole(id, { role: nextRole });
            setMessage(result.message);
            await loadUsers();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Cannot update role'));
        }
    };

    const handleUpdateStatus = async (id: number, status: AccountStatus) => {
        setMessage(null);
        setErrorMessage(null);
        try {
            const result = await adminUserService.updateStatus(id, { accountStatus: status });
            setMessage(result.message);
            await loadUsers();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Cannot update status'));
        }
    };

    const handleDelete = async (id: number) => {
        setMessage(null);
        setErrorMessage(null);
        try {
            const result = await adminUserService.deleteUser(id);
            setMessage(result.message);
            await loadUsers();
        } catch (error) {
            setErrorMessage(getApiErrorMessage(error, 'Cannot delete user'));
        }
    };

    return (
        <main className="space-y-5 p-6">
            <h1 className="text-2xl font-semibold text-slate-900">Admin User Management</h1>

            <Card className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Create Admin / Superadmin</h2>
                <form onSubmit={handleCreateUser} className="grid max-w-[420px] gap-3">
                    <Input
                        type="text"
                        placeholder="Name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                    />
                    <Input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                    <Input
                        type="password"
                        placeholder="Password (min 8 chars)"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        minLength={8}
                        required
                    />
                    <select
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                        value={role}
                        onChange={(event) => setRole(event.target.value as UserRole)}
                    >
                        <option value="admin">admin</option>
                        <option value="superadmin">superadmin</option>
                    </select>
                    <Button type="submit" className="w-full sm:w-fit">
                        Create
                    </Button>
                </form>
            </Card>

            {message && <p className="text-sm text-green-700">{message}</p>}
            {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}

            <Card className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">User List</h2>
                {loading ? (
                    <p className="text-sm text-slate-700">Loading...</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm">
                            <thead>
                                <tr>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">ID</th>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">Name</th>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">Email</th>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">Role</th>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">Status</th>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.id}>
                                        <td className="border-b border-slate-200 p-2 text-slate-800">{user.id}</td>
                                        <td className="border-b border-slate-200 p-2 text-slate-800">{user.name}</td>
                                        <td className="border-b border-slate-200 p-2 text-slate-800">{user.email}</td>
                                        <td className="border-b border-slate-200 p-2">
                                            <select
                                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                                                value={user.role}
                                                onChange={(event) => {
                                                    void handleUpdateRole(user.id, event.target.value as UserRole);
                                                }}
                                            >
                                                <option value="admin">admin</option>
                                                <option value="superadmin">superadmin</option>
                                            </select>
                                        </td>
                                        <td className="border-b border-slate-200 p-2">
                                            <select
                                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-300"
                                                value={user.accountStatus}
                                                onChange={(event) => {
                                                    void handleUpdateStatus(user.id, event.target.value as AccountStatus);
                                                }}
                                            >
                                                <option value="active">active</option>
                                                <option value="disabled">disabled</option>
                                            </select>
                                        </td>
                                        <td className="border-b border-slate-200 p-2">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={() => void handleDelete(user.id)}
                                            >
                                                Soft Delete
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </main>
    );
}
