<template>
  <div class="login-container">
    <div class="bg-glow">
      <div class="glow-item glow-1"></div>
      <div class="glow-item glow-2"></div>
      <div class="glow-item glow-3"></div>
      <div class="glow-item glow-4"></div>
    </div>
    <div class="login-card">
      <div class="login-header">
        <div class="logo">
          <span class="logo-icon">醒</span>
        </div>
        <h1>醒美闪图</h1>
        <p>后台管理系统</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" class="login-form">
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            prefix-icon="User"
            size="large"
          />
        </el-form-item>

        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            prefix-icon="Lock"
            size="large"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>

        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            class="login-btn"
            @click="handleLogin"
          >
            登 录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useUserStore } from '../store'

const router = useRouter()
const userStore = useUserStore()
const formRef = ref(null)
const loading = ref(false)

const form = reactive({
  username: '',
  password: ''
})

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

const handleLogin = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const res = await userStore.login(form)
    if (res.code === 0 || res.code === 200) {
      ElMessage.success('登录成功')
      router.push('/dashboard')
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
.login-container {
  width: 100%;
  height: 100vh;
  min-height: 100vh;
  background: #fffaf5;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}

.bg-glow {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
}

.glow-item {
  position: absolute;
  filter: blur(80px);
  opacity: 0.5;
  border-radius: 50%;
  animation: move 20s infinite alternate ease-in-out;
  mix-blend-mode: multiply;
}

.glow-1 {
  width: 800px;
  height: 800px;
  background: radial-gradient(circle, rgba(245, 208, 169, 0.8) 0%, rgba(245, 208, 169, 0) 70%);
  top: -300px;
  left: -200px;
  animation-duration: 25s;
}

.glow-2 {
  width: 900px;
  height: 900px;
  background: radial-gradient(circle, rgba(232, 182, 134, 0.7) 0%, rgba(232, 182, 134, 0) 70%);
  bottom: -300px;
  right: -200px;
  animation-delay: -7s;
  animation-duration: 30s;
}

.glow-3 {
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(255, 154, 158, 0.6) 0%, rgba(255, 154, 158, 0) 70%);
  top: 10%;
  right: -100px;
  animation-delay: -12s;
  animation-duration: 28s;
}

.glow-4 {
  width: 700px;
  height: 700px;
  background: radial-gradient(circle, rgba(250, 208, 196, 0.7) 0%, rgba(250, 208, 196, 0) 70%);
  bottom: -100px;
  left: -100px;
  animation-delay: -18s;
  animation-duration: 22s;
}

@keyframes move {
  0% {
    transform: translate(0, 0) scale(1) rotate(0deg);
  }
  33% {
    transform: translate(150px, 100px) scale(1.2) rotate(120deg);
  }
  66% {
    transform: translate(-100px, 200px) scale(0.8) rotate(240deg);
  }
  100% {
    transform: translate(50px, -50px) scale(1.1) rotate(360deg);
  }
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 24px;
  padding: 40px;
  box-shadow: 0 20px 50px rgba(200, 139, 77, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.5);
  position: relative;
  z-index: 1;
  transition: transform 0.3s ease;

  &:hover {
    transform: translateY(-5px);
  }
}

.login-header {
  text-align: center;
  margin-bottom: 40px;

  .logo {
    width: 80px;
    height: 80px;
    margin: 0 auto 16px;
    background: linear-gradient(135deg, #F5D0A9 0%, #E8B686 100%);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 20px rgba(232, 182, 134, 0.3);

    .logo-icon {
      font-size: 36px;
      color: #fff;
      font-weight: bold;
    }
  }

  h1 {
    font-size: 24px;
    color: #333;
    margin-bottom: 8px;
  }

  p {
    font-size: 14px;
    color: #999;
  }
}

.login-form {
  .el-form-item {
    margin-bottom: 24px;
  }

  .login-btn {
    width: 100%;
    height: 46px;
    font-size: 16px;
    background: linear-gradient(135deg, #F5D0A9 0%, #E8B686 100%);
    border: none;
    border-radius: 23px;

    &:hover {
      background: linear-gradient(135deg, #E8B686 0%, #C68B4D 100%);
    }
  }
}

:deep(.el-input__wrapper) {
  border-radius: 10px;
  padding: 4px 12px;
  box-shadow: 0 0 0 1px #f0e6dc inset;

  &:hover {
    box-shadow: 0 0 0 1px #E8B686 inset;
  }

  &.is-focus {
    box-shadow: 0 0 0 1px #E8B686 inset;
  }
}
</style>
