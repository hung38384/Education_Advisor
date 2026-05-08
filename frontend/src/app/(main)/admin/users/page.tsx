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
            setErrorMessage(getApiErrorMessage(error, 'Không tải được danh sách người dùng'));
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
            setErrorMessage(getApiErrorMessage(error, 'Không tạo được người dùng'));
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
            setErrorMessage(getApiErrorMessage(error, 'Không cập nhật được vai trò'));
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
            setErrorMessage(getApiErrorMessage(error, 'Không cập nhật được trạng thái'));
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
            setErrorMessage(getApiErrorMessage(error, 'Không xóa được người dùng'));
        }
    };

    return (
        <main className="space-y-5 p-6">
            <h1 className="text-2xl font-semibold text-slate-900">Quản trị người dùng</h1>

            <Card className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Tạo quản trị viên / siêu quản trị</h2>
                <form onSubmit={handleCreateUser} className="grid max-w-[420px] gap-3">
                    <Input
                        type="text"
                        placeholder="Họ và tên"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                    />
                    <Input
                        type="email"
                        placeholder="Địa chỉ email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                    />
                    <Input
                        type="password"
                        placeholder="Mật khẩu (tối thiểu 8 ký tự)"
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
                        <option value="admin">Quản trị viên</option>
                        <option value="superadmin">Siêu quản trị</option>
                    </select>
                    <Button type="submit" className="w-full sm:w-fit">
                        Tạo người dùng
                    </Button>
                </form>
            </Card>

            {message && <p className="text-sm text-green-700">{message}</p>}
            {errorMessage && <p className="text-sm text-red-700">{errorMessage}</p>}

            <Card className="space-y-4">
                <h2 className="text-lg font-semibold text-slate-900">Danh sách người dùng</h2>
                {loading ? (
                    <p className="text-sm text-slate-700">Đang tải...</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm">
                            <thead>
                                <tr>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">Mã</th>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">Họ và tên</th>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">Địa chỉ email</th>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">Vai trò</th>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">Trạng thái</th>
                                    <th className="border-b border-slate-300 p-2 text-left font-semibold text-slate-700">Thao tác</th>
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
                                                <option value="admin">Quản trị viên</option>
                                                <option value="superadmin">Siêu quản trị</option>
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
                                                <option value="active">Đang hoạt động</option>
                                                <option value="disabled">Đã vô hiệu hóa</option>
                                            </select>
                                        </td>
                                        <td className="border-b border-slate-200 p-2">
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                onClick={() => void handleDelete(user.id)}
                                            >
                                                Xóa mềm
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
