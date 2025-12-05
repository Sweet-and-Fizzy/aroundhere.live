<script setup lang="ts">
definePageMeta({
  middleware: 'admin',
})

const { user: currentUser } = useUserSession()

const { data: response, refresh } = await useFetch('/api/admin/users')
const users = computed(() => response.value?.users || [])

const saving = ref<string | null>(null)

async function updateRole(userId: string, newRole: string) {
  saving.value = userId
  try {
    await $fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: { role: newRole },
    })
    refresh()
  } catch (error: any) {
    alert(error.data?.message || 'Failed to update role')
  } finally {
    saving.value = null
  }
}

async function toggleActive(userId: string, isActive: boolean) {
  saving.value = userId
  try {
    await $fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: { isActive },
    })
    refresh()
  } catch (error: any) {
    alert(error.data?.message || 'Failed to update user')
  } finally {
    saving.value = null
  }
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getRoleBadgeClass(role: string) {
  switch (role) {
    case 'ADMIN':
      return 'bg-purple-100 text-purple-700'
    case 'MODERATOR':
      return 'bg-blue-100 text-blue-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

useSeoMeta({
  title: 'Admin - Users',
  description: 'Manage users and roles',
})
</script>

<template>
  <div class="px-4 py-8 max-w-4xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-3xl font-bold">
        Users
      </h1>
      <span class="text-sm text-gray-500">
        {{ users.length }} user{{ users.length === 1 ? '' : 's' }}
      </span>
    </div>

    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              User
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Role
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Joined
            </th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr
            v-for="user in users"
            :key="user.id"
            class="hover:bg-gray-50"
            :class="{ 'opacity-50': !user.isActive }"
          >
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex items-center">
                <div>
                  <div class="font-medium text-gray-900">
                    {{ user.displayName || user.email }}
                  </div>
                  <div
                    v-if="user.displayName"
                    class="text-sm text-gray-500"
                  >
                    {{ user.email }}
                  </div>
                  <div
                    v-if="user.id === currentUser?.id"
                    class="text-xs text-primary-600"
                  >
                    (you)
                  </div>
                </div>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <select
                :value="user.role"
                :disabled="saving === user.id || user.id === currentUser?.id"
                class="text-sm border border-gray-300 rounded px-2 py-1 disabled:opacity-50 disabled:cursor-not-allowed"
                @change="(e) => updateRole(user.id, (e.target as HTMLSelectElement).value)"
              >
                <option value="ADMIN">
                  Admin
                </option>
                <option value="MODERATOR">
                  Moderator
                </option>
                <option value="USER">
                  User
                </option>
              </select>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="flex items-center gap-2">
                <span
                  class="px-2 py-1 text-xs font-medium rounded"
                  :class="user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
                >
                  {{ user.isActive ? 'Active' : 'Inactive' }}
                </span>
                <button
                  v-if="user.id !== currentUser?.id"
                  :disabled="saving === user.id"
                  class="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  @click="toggleActive(user.id, !user.isActive)"
                >
                  {{ user.isActive ? 'Deactivate' : 'Activate' }}
                </button>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {{ formatDate(user.createdAt) }}
            </td>
          </tr>
          <tr v-if="users.length === 0">
            <td
              colspan="4"
              class="px-6 py-8 text-center text-gray-500"
            >
              No users found.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mt-6 text-sm text-gray-500">
      <p><strong>Roles:</strong></p>
      <ul class="list-disc list-inside mt-1">
        <li><strong>Admin</strong> - Full access, can manage users and assign roles</li>
        <li><strong>Moderator</strong> - Can access admin pages to manage venues and scrapers</li>
        <li><strong>User</strong> - Standard user, no admin access</li>
      </ul>
    </div>
  </div>
</template>
