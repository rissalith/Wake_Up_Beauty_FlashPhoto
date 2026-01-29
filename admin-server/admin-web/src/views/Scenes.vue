<template>
  <div class="scene-management">
    <!-- 头部操作栏 -->
    <div class="page-header">
      <div class="header-left">
        <h2>场景管理</h2>
        <span class="subtitle">管理所有AI生成场景，配置步骤和定价</span>
      </div>
      <div class="header-right">
        <el-button type="primary" @click="showAddDialog">
          <el-icon><Plus /></el-icon> 新增场景
        </el-button>
      </div>
    </div>

    <!-- 状态筛选Tab -->
    <div class="status-tabs">
      <el-radio-group v-model="statusFilter" @change="filterScenes">
        <el-radio-button label="all">全部</el-radio-button>
        <el-radio-button label="active">上线中</el-radio-button>
        <el-radio-button label="coming_soon">即将上线</el-radio-button>
        <el-radio-button label="inactive">未上线</el-radio-button>
      </el-radio-group>
      <span class="scene-count">共 {{ filteredScenes.length }} 个场景</span>
    </div>

    <!-- 场景列表 - 支持拖动排序 -->
    <div class="scene-list" v-loading="loading">
      <el-table :data="filteredScenes" row-key="id" empty-text="暂无场景数据，请点击「新增场景」按钮添加">
        <el-table-column label="排序" width="60" align="center">
          <template #default>
            <span class="drag-handle">☰</span>
          </template>
        </el-table-column>
        <el-table-column label="场景" min-width="240">
          <template #default="{ row }">
            <div class="scene-info">
              <el-image
                class="scene-icon-img"
                :src="row.icon"
                fit="cover"
                :preview-src-list="[row.icon]"
                preview-teleported
              >
                <template #error>
                  <div class="image-placeholder">{{ row.name?.charAt(0) || '?' }}</div>
                </template>
              </el-image>
              <div class="scene-detail">
                <div class="scene-name">{{ row.name }}</div>
                <div class="scene-desc">{{ row.description }}</div>
                <div class="scene-key">ID: {{ row.scene_key || row.id }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="200" align="center">
          <template #default="{ row }">
            <div class="status-switch">
              <div class="status-option" :class="{ active: row.status === 'active' }" @click="setStatus(row, 'active')">
                <span class="status-dot green"></span>
                <span class="status-text">上线</span>
              </div>
              <div class="status-option" :class="{ active: row.status === 'coming_soon' }" @click="setStatus(row, 'coming_soon')">
                <span class="status-dot yellow"></span>
                <span class="status-text">即将</span>
              </div>
              <div class="status-option" :class="{ active: row.status === 'inactive' }" @click="setStatus(row, 'inactive')">
                <span class="status-dot gray"></span>
                <span class="status-text">下线</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="审核安全" width="90" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.is_review_safe" :active-value="1" :inactive-value="0"
                       @change="updateScene(row)" />
          </template>
        </el-table-column>
        <el-table-column label="高亮" width="80" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.is_highlighted" :active-value="1" :inactive-value="0"
                       @change="updateScene(row)" />
          </template>
        </el-table-column>
        <el-table-column label="醒币" width="80" align="center">
          <template #default="{ row }">
            <span class="points-value">{{ row.points_cost || row.price }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <div class="action-btns-row">
              <el-button type="primary" link size="small" @click="editScene(row)">编辑</el-button>
              <el-button type="danger" link size="small" @click="deleteScene(row)">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

    </div>

    <!-- 新增/编辑场景对话框 - 包含Tab切换 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑场景' : '新增场景'" width="90%" style="max-width: 1200px;" top="5vh" v-dialog-drag>
      <el-tabs v-model="activeTab" type="card">
        <!-- 基本信息Tab -->
        <el-tab-pane label="基本信息" name="basic">
          <el-form :model="form" :rules="rules" ref="formRef" label-width="100px">
            <el-form-item label="场景ID" prop="id">
              <el-input v-model="form.id" :disabled="isEdit" placeholder="如: idphoto, portrait" />
            </el-form-item>
            <el-form-item label="场景名称" prop="name">
              <div class="input-with-translate">
                <el-input v-model="form.name" placeholder="中文名称" style="flex: 1" />
                <el-input v-model="form.name_en" placeholder="English name" style="flex: 1" />
                <el-tooltip content="调用腾讯翻译API" placement="top">
                  <el-button type="primary" link @click="translateSceneName" :icon="MagicStick" :loading="translating.name" class="translate-btn">翻译</el-button>
                </el-tooltip>
              </div>
            </el-form-item>
            <el-form-item label="场景描述" prop="description">
              <div class="input-with-translate">
                <el-input v-model="form.description" type="textarea" :rows="2" placeholder="简短描述（中文）" style="flex: 1" />
                <el-input v-model="form.description_en" type="textarea" :rows="2" placeholder="English description" style="flex: 1" />
                <el-tooltip content="调用腾讯翻译API" placement="top">
                  <el-button type="primary" link @click="translateSceneDesc" :icon="MagicStick" :loading="translating.desc" class="translate-btn">翻译</el-button>
                </el-tooltip>
              </div>
            </el-form-item>
            <el-form-item label="场景图标">
              <div class="icon-upload-inline">
                <div class="scene-icon-selector" @click="showSceneIconPicker" title="点击从素材库选择图标">
                  <el-image
                    v-if="form.icon"
                    class="icon-preview-inline"
                    :src="form.icon"
                    fit="cover"
                  />
                  <div v-else class="icon-placeholder-inline">
                    <el-icon><Plus /></el-icon>
                    <span>选择图标</span>
                  </div>
                </div>
                <div class="icon-upload-actions">
                  <el-button v-if="form.icon" size="small" link type="danger" @click.stop="form.icon = ''">清除</el-button>
                  <el-upload
                    class="icon-upload-btn"
                    :action="uploadUrl"
                    :headers="uploadHeaders"
                    :data="{ sceneId: form.id }"
                    :show-file-list="false"
                    :on-success="handleFormIconUploadSuccess"
                    :on-error="handleFormIconUploadError"
                    :before-upload="beforeIconUpload"
                    accept="image/*"
                  >
                    <el-button size="small" link>本地上传</el-button>
                  </el-upload>
                </div>
                <div class="icon-upload-tips">
                  <p>点击图标从COS选择</p>
                  <p>建议: 200×200px PNG</p>
                </div>
              </div>
            </el-form-item>
            <el-row :gutter="20">
              <el-col :span="12">
                <el-form-item label="状态">
                  <el-select v-model="form.status" style="width: 100%">
                    <el-option label="上线中" value="active" />
                    <el-option label="即将上线" value="coming_soon" />
                    <el-option label="未上线" value="inactive" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="消耗醒币">
                  <el-input-number v-model="form.points_cost" :min="1" :max="1000" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="审核安全">
              <el-switch v-model="form.is_review_safe" />
              <span class="form-tip">审核模式下是否显示此场景</span>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <!-- 步骤配置Tab - 仅编辑模式显示 -->
        <el-tab-pane label="步骤配置" name="steps" :disabled="!isEdit">
          <div class="steps-config-3col">
            <!-- 左栏：步骤列表 -->
            <div class="steps-sidebar">
              <div class="sidebar-title">步骤列表</div>
              <draggable v-model="steps" item-key="id" handle=".drag-handle" @end="onStepReorder" class="steps-list-compact">
                <template #item="{ element, index }">
                  <div class="step-item-compact" :class="{ active: currentStepIndex === index }" @click="selectStep(index)">
                    <span class="drag-handle">☰</span>
                    <span class="step-order">{{ index + 1 }}</span>
                    <div class="step-info-compact">
                      <span class="step-title-compact">{{ element.title }}</span>
                      <el-tag size="small" type="info">{{ element.step_key || '未设置' }}</el-tag>
                    </div>
                    <el-button size="small" link type="danger" @click.stop="deleteStep(index)">×</el-button>
                  </div>
                </template>
              </draggable>
              <el-button class="add-step-btn" size="small" @click="addStep">+ 添加步骤</el-button>
            </div>

            <!-- 中栏：步骤基本配置 -->
            <div class="step-basic-config" v-if="currentStep">
              <div class="config-section-title">基本配置</div>
              <el-form :model="currentStep" label-width="80px" size="small" label-position="top">
                <el-form-item label="步骤图标">
                  <div class="step-icon-selector">
                    <div class="step-icon-preview" @click="showStepIconPicker">
                      <img v-if="currentStep.icon" :src="currentStep.icon" class="step-icon-img" />
                      <div v-else class="step-icon-empty">
                        <el-icon><Plus /></el-icon>
                      </div>
                    </div>
                    <el-button v-if="currentStep.icon" size="small" link type="danger" @click="currentStep.icon = ''">清除</el-button>
                  </div>
                </el-form-item>
                <el-form-item label="步骤标识">
                  <el-input v-model="currentStep.step_key" placeholder="如: gender, background" />
                </el-form-item>
                <el-form-item label="步骤标题">
                  <div class="input-with-translate-compact">
                    <el-input v-model="currentStep.title" placeholder="中文" />
                    <el-input v-model="currentStep.title_en" placeholder="English" />
                    <el-tooltip content="翻译" placement="top">
                      <el-button type="primary" link size="small" @click="translateStepTitle" :icon="MagicStick" :loading="translating.step" />
                    </el-tooltip>
                  </div>
                </el-form-item>
                <el-form-item label="组件类型">
                  <el-select v-model="currentStep.component_type" style="width: 100%">
                    <el-option label="图片上传" value="image_upload" />
                    <el-option label="性别选择" value="gender_select" />
                    <el-option label="单选框" value="radio" />
                    <el-option label="标签选择" value="tags" />
                    <el-option label="规格选择" value="spec_select" />
                    <el-option label="颜色选择" value="color_picker" />
                    <el-option label="图片标签" value="image_tags" />
                    <el-option label="滑块" value="slider" />
                    <el-option label="摇骰子" value="random_dice" />
                  </el-select>
                </el-form-item>
                <!-- 摇骰子定价配置 -->
                <div v-if="currentStep.component_type === 'random_dice'" class="dice-pricing-config">
                  <el-form-item label="免费次数">
                    <el-input-number v-model="currentStep.free_count" :min="0" :max="99" size="small" style="width: 100%" />
                  </el-form-item>
                  <el-form-item label="每次消耗">
                    <el-input-number v-model="currentStep.cost_per_roll" :min="0" :max="999" size="small" style="width: 100%">
                      <template #suffix>醒币</template>
                    </el-input-number>
                  </el-form-item>
                </div>
                <div class="switch-row">
                  <el-form-item label="必填">
                    <el-switch v-model="currentStep.is_required" />
                  </el-form-item>
                  <el-form-item label="显示">
                    <el-switch v-model="currentStep.is_visible" />
                  </el-form-item>
                  <el-form-item label="性别分类" v-if="currentStep.component_type === 'image_tags'">
                    <el-switch v-model="currentStep.gender_based" />
                  </el-form-item>
                </div>
              </el-form>
            </div>
            <div class="step-basic-empty" v-else>
              <el-empty description="请选择步骤" :image-size="60" />
            </div>

            <!-- 右栏：选项配置 -->
            <div class="step-options-config" v-if="currentStep">
              <!-- 图片上传组件 - 不需要选项配置 -->
              <template v-if="currentStep.component_type === 'image_upload'">
                <div class="no-options-tip">
                  <el-icon :size="40" color="#909399"><Upload /></el-icon>
                  <p>图片上传组件</p>
                  <span>此组件用于用户上传照片，无需配置选项</span>
                </div>
              </template>

              <!-- 性别选择组件 - 不需要选项配置 -->
              <template v-else-if="currentStep.component_type === 'gender_select'">
                <div class="no-options-tip">
                  <el-icon :size="40" color="#909399"><User /></el-icon>
                  <p>性别选择组件</p>
                  <span>此组件提供男/女选项，无需额外配置</span>
                </div>
              </template>

              <!-- random_dice类型（摇骰子/抽奖）专用配置 - 单独处理 -->
              <template v-else-if="currentStep.component_type === 'random_dice'">
                <div class="random-dice-config-standalone">
                  <div class="dice-config-header">
                    <el-checkbox v-model="currentStep.config.showImage" size="small">显示图片</el-checkbox>
                    <span class="config-tip">（勾选后每个选项需要配置图片）</span>
                  </div>

                  <!-- 品级方案管理 -->
                  <div class="grade-scheme-section">
                    <div class="section-title">
                      品级方案管理
                    </div>
                    <div v-if="form.id && currentStep.step_key" class="grade-scheme-selector">
                      <div class="grade-scheme-row">
                        <el-select
                          v-model="currentStep.config.gradeSchemeId"
                          placeholder="选择品级方案"
                          style="width: 180px"
                          size="small"
                          @change="onGradeSchemeChange"
                        >
                          <el-option
                            v-for="scheme in gradeSchemes"
                            :key="scheme.id"
                            :label="scheme.name"
                            :value="scheme.id"
                          />
                        </el-select>
                        <el-button size="small" @click="showGradeSchemeManager">编辑</el-button>
                      </div>
                      <!-- 品级预览 -->
                      <div v-if="selectedGradeScheme" class="grade-preview">
                        <span
                          v-for="grade in selectedGradeScheme.grades"
                          :key="grade.id"
                          class="grade-preview-item"
                          :style="{ background: grade.color, color: '#fff' }"
                        >
                          {{ grade.name }}
                        </span>
                      </div>
                    </div>
                    <el-empty v-else description="请先保存场景" :image-size="60" />
                  </div>

                  <!-- 词条池管理 -->
                  <div class="dice-pool-manager">
                    <div class="section-title">词条池管理</div>
                    <draw-pool-manager
                      v-if="form.id && currentStep.step_key"
                      :scene-id="form.id"
                      :step-key="currentStep.step_key"
                      :show-image="currentStep.config?.showImage || false"
                      :key="currentStep.step_key"
                    />
                    <el-empty v-else description="请先保存场景" :image-size="60" />
                  </div>
                </div>
              </template>

              <!-- 其他需要配置选项的组件 -->
              <template v-else>
                <div class="config-section-title">
                  选项配置
                  <div class="config-title-actions">
                    <el-tooltip content="批量翻译所有选项为英文" placement="top">
                      <el-button size="small" type="success" link @click="translateAllOptions" :icon="MagicStick">批量翻译</el-button>
                    </el-tooltip>
                    <el-button size="small" type="primary" link @click="addOption">+ 添加选项</el-button>
                  </div>
                </div>

              <!-- 性别筛选（仅启用性别分类时显示） -->
              <div v-if="currentStep.component_type === 'image_tags' && currentStep.gender_based" class="options-filter-compact">
                <el-radio-group v-model="optionGenderFilter" size="small">
                  <el-radio-button label="">全部</el-radio-button>
                  <el-radio-button label="male">男</el-radio-button>
                  <el-radio-button label="female">女</el-radio-button>
                </el-radio-group>
                <span class="options-count">{{ filteredOptions.length }} 项</span>
              </div>

              <!-- 规格选择提示 -->
              <div v-if="currentStep.component_type === 'spec_select'" class="spec-tip-compact">
                <el-icon><InfoFilled /></el-icon>
                <span>尺寸用于后端动态裁剪</span>
              </div>

              <div class="options-scroll-area">
                <!-- image_tags 专用配置 - 水平布局：左图右标签 -->
                <template v-if="currentStep.component_type === 'image_tags'">
                  <div v-for="(opt, idx) in filteredOptions" :key="opt.option_key || idx" class="image-tag-row">
                    <!-- 左侧：图片（点击从COS选择） -->
                    <div class="image-tag-left">
                      <div class="option-thumb-selector" @click="showCosImagePickerByOpt(opt)" title="点击从素材库选择图片">
                        <el-image v-if="opt.image" class="option-thumb" :src="opt.image" fit="cover" />
                        <div v-else class="option-thumb-empty">
                          <el-icon><Plus /></el-icon>
                        </div>
                      </div>
                      <el-button v-if="opt.image" size="small" link type="danger" @click.stop="opt.image = ''" title="清除图片">清除</el-button>
                    </div>
                    <!-- 右侧：两行布局 -->
                    <div class="image-tag-right">
                      <!-- 第一行：名称字段 -->
                      <div class="image-tag-row1">
                        <div class="image-tag-field">
                          <label>中文</label>
                          <el-input v-model="opt.label" size="small" style="width: 90px" placeholder="名称" />
                        </div>
                        <div class="image-tag-field">
                          <label>English</label>
                          <div class="field-with-btn">
                            <el-input v-model="opt.label_en" size="small" style="width: 100px" placeholder="Name" />
                            <el-tooltip content="翻译" placement="top">
                              <el-button type="primary" link size="small" @click="translateOption(opt)" class="mini-translate-btn">
                                <el-icon :size="12"><MagicStick /></el-icon>
                              </el-button>
                            </el-tooltip>
                          </div>
                        </div>
                        <div class="image-tag-field" v-if="currentStep.gender_based">
                          <label>性别</label>
                          <el-select v-model="opt.gender" size="small" style="width: 65px" clearable>
                            <el-option label="男" value="male" />
                            <el-option label="女" value="female" />
                          </el-select>
                        </div>
                        <div class="image-tag-field">
                          <label>&nbsp;</label>
                          <el-checkbox :model-value="opt.is_default === 1" @change="setDefaultOption(opt)" size="small" :disabled="opt.is_default === 1">默认</el-checkbox>
                        </div>
                        <div class="image-tag-field">
                          <label>&nbsp;</label>
                          <el-button size="small" link type="danger" @click="deleteOptionByOpt(opt)">删除</el-button>
                        </div>
                      </div>
                      <!-- 第二行：AI提示词 -->
                      <div class="image-tag-row2">
                        <label>AI提示词</label>
                        <el-input v-model="opt.prompt_text" size="small" placeholder="发送给AI的描述文字" />
                      </div>
                    </div>
                  </div>
                </template>

                <!-- tags类型（标签选择）配置 - 表格布局 -->
                <template v-else-if="currentStep.component_type === 'tags'">
                  <!-- 表头 -->
                  <div class="tags-table-header">
                    <div class="tags-col tags-col-label-main">中文</div>
                    <div class="tags-col tags-col-label">English</div>
                    <div class="tags-col tags-col-prompt">AI提示词</div>
                    <div class="tags-col tags-col-default">默认</div>
                    <div class="tags-col tags-col-action">操作</div>
                  </div>
                  <!-- 数据行 -->
                  <div v-for="(opt, idx) in currentStep.options" :key="idx" class="tags-table-row">
                    <div class="tags-col tags-col-label-main">
                      <el-input v-model="opt.label" placeholder="标签名" size="small" />
                    </div>
                    <div class="tags-col tags-col-label">
                      <div class="field-with-btn-inline">
                        <el-input v-model="opt.label_en" placeholder="Tag" size="small" />
                        <el-button type="primary" link size="small" @click="translateOption(opt)" class="mini-translate-btn">
                          <el-icon :size="12"><MagicStick /></el-icon>
                        </el-button>
                      </div>
                    </div>
                    <div class="tags-col tags-col-prompt">
                      <el-input v-model="opt.prompt_text" placeholder="发送给AI的描述" size="small" />
                    </div>
                    <div class="tags-col tags-col-default">
                      <el-checkbox :model-value="opt.is_default === 1" @change="setDefaultOption(opt)" size="small" :disabled="opt.is_default === 1" />
                    </div>
                    <div class="tags-col tags-col-action">
                      <el-button size="small" link type="danger" @click="deleteOption(idx)">删除</el-button>
                    </div>
                  </div>
                </template>

                <!-- spec_select类型（规格选择）专用配置 - 表格布局 -->
                <template v-else-if="currentStep.component_type === 'spec_select'">
                  <!-- 表头 -->
                  <div class="spec-table-header">
                    <div class="spec-col spec-col-label-main">中文</div>
                    <div class="spec-col spec-col-label">English</div>
                    <div class="spec-col spec-col-size">宽度(mm)</div>
                    <div class="spec-col spec-col-size">高度(mm)</div>
                    <div class="spec-col spec-col-default">默认</div>
                    <div class="spec-col spec-col-action">操作</div>
                  </div>
                  <!-- 数据行 -->
                  <div v-for="(opt, idx) in currentStep.options" :key="idx" class="spec-table-row">
                    <div class="spec-col spec-col-label-main">
                      <el-input v-model="opt.label" placeholder="一寸" size="small" />
                    </div>
                    <div class="spec-col spec-col-label">
                      <div class="field-with-btn-inline">
                        <el-input v-model="opt.label_en" placeholder="1 inch" size="small" />
                        <el-button type="primary" link size="small" @click="translateOption(opt)" class="mini-translate-btn">
                          <el-icon :size="12"><MagicStick /></el-icon>
                        </el-button>
                      </div>
                    </div>
                    <div class="spec-col spec-col-size">
                      <el-input v-model.number="opt.width" type="number" size="small" placeholder="25" />
                    </div>
                    <div class="spec-col spec-col-size">
                      <el-input v-model.number="opt.height" type="number" size="small" placeholder="35" />
                    </div>
                    <div class="spec-col spec-col-default">
                      <el-checkbox :model-value="opt.is_default === 1" @change="setDefaultOption(opt)" size="small" :disabled="opt.is_default === 1" />
                    </div>
                    <div class="spec-col spec-col-action">
                      <el-button size="small" link type="danger" @click="deleteOption(idx)">删除</el-button>
                    </div>
                  </div>
                </template>

                <!-- 其他组件类型的通用配置 - 表格布局 -->
                <template v-else-if="currentStep.component_type !== 'random_dice'">
                  <!-- 表头 -->
                  <div class="common-table-header">
                    <div class="common-col common-col-label-main">中文</div>
                    <div class="common-col common-col-label">English</div>
                    <div class="common-col common-col-extra" v-if="currentStep.component_type === 'color_picker'">颜色</div>
                    <div class="common-col common-col-extra" v-else>图片URL</div>
                    <div class="common-col common-col-prompt">AI提示词</div>
                    <div class="common-col common-col-default">默认</div>
                    <div class="common-col common-col-action">操作</div>
                  </div>
                  <!-- 数据行 -->
                  <div v-for="(opt, idx) in currentStep.options" :key="idx" class="common-table-row">
                    <div class="common-col common-col-label-main">
                      <el-input v-model="opt.label" placeholder="选项名" size="small" />
                    </div>
                    <div class="common-col common-col-label">
                      <div class="field-with-btn-inline">
                        <el-input v-model="opt.label_en" placeholder="Option" size="small" />
                        <el-button type="primary" link size="small" @click="translateOption(opt)" class="mini-translate-btn">
                          <el-icon :size="12"><MagicStick /></el-icon>
                        </el-button>
                      </div>
                    </div>
                    <div class="common-col common-col-extra">
                      <el-color-picker v-model="opt.color" v-if="currentStep.component_type === 'color_picker'" size="small" />
                      <el-input v-model="opt.image" placeholder="URL" size="small" v-else />
                    </div>
                    <div class="common-col common-col-prompt">
                      <el-input v-model="opt.prompt_text" placeholder="发送给AI的描述" size="small" />
                    </div>
                    <div class="common-col common-col-default">
                      <el-checkbox :model-value="opt.is_default === 1" @change="setDefaultOption(opt)" size="small" :disabled="opt.is_default === 1" />
                    </div>
                    <div class="common-col common-col-action">
                      <el-button size="small" link type="danger" @click="deleteOption(idx)">删除</el-button>
                    </div>
                  </div>
                </template>

              </div>
              </template>
            </div>
            <div class="step-options-empty" v-else>
              <el-empty description="选择步骤后配置选项" :image-size="60" />
            </div>
          </div>
        </el-tab-pane>

        <!-- Prompt模板Tab - 仅编辑模式显示 -->
        <el-tab-pane label="Prompt模板" name="prompt" :disabled="!isEdit">
          <prompt-template-editor
            v-model="promptFormData"
            :scene-steps="steps"
            :scene-id="form.id"
          />
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveAll" :loading="saving">保存</el-button>
      </template>
    </el-dialog>

    <!-- COS图片选择对话框 -->
    <el-dialog v-model="cosPickerVisible" title="从COS选择图片" width="90%" style="max-width: 900px;" append-to-body v-dialog-drag>
      <div class="cos-picker">
        <div class="cos-picker-header">
          <!-- 性别筛选（仅当前步骤启用gender_based时显示） -->
          <el-radio-group v-if="currentStep && currentStep.gender_based" v-model="cosGenderFilter" size="small" @change="filterCosImages">
            <el-radio-button label="">全部</el-radio-button>
            <el-radio-button label="male">男</el-radio-button>
            <el-radio-button label="female">女</el-radio-button>
          </el-radio-group>
          <el-select v-model="cosFilterFolder" placeholder="选择文件夹" clearable style="width: 200px" @change="filterCosImages">
            <el-option label="全部文件夹" value="" />
            <el-option v-for="folder in cosFolders" :key="folder" :label="folder || '根目录'" :value="folder" />
          </el-select>
          <el-input v-model="cosSearchKeyword" placeholder="搜索文件名..." clearable style="width: 180px" @input="filterCosImages" />
          <el-button @click="loadCosImages" :loading="cosLoading">刷新</el-button>
        </div>
        <div class="cos-filter-tags" v-if="filteredCosImages.length > 0">
          <span class="filter-result">共 {{ filteredCosImages.length }} 张图片</span>
        </div>
        <div class="cos-image-grid" v-loading="cosLoading">
          <div
            v-for="img in filteredCosImages"
            :key="img.key"
            class="cos-image-item"
            :class="{ selected: selectedCosImage === img.url }"
            @click="selectCosImage(img)"
          >
            <el-image :src="img.url" fit="cover" lazy />
            <div class="cos-image-info">
              <div class="cos-image-name">{{ img.fileName }}</div>
              <div class="cos-image-tags">
                <el-tag size="small" type="info" v-if="img.folderPath && img.folderPath !== '根目录'">{{ img.folderPath }}</el-tag>
              </div>
            </div>
          </div>
          <el-empty v-if="!cosLoading && filteredCosImages.length === 0" description="暂无图片，请调整筛选条件" />
        </div>
      </div>
      <template #footer>
        <el-button @click="cosPickerVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmCosImage" :disabled="!selectedCosImage">确定选择</el-button>
      </template>
    </el-dialog>

    <!-- 步骤图标选择对话框 -->
    <el-dialog v-model="stepIconPickerVisible" title="选择步骤图标" width="90%" style="max-width: 600px;" append-to-body v-dialog-drag>
      <div class="step-icon-picker">
        <el-input v-model="stepIconSearch" placeholder="搜索图标..." clearable style="width: 200px; margin-bottom: 12px" />
        <div class="step-icon-grid" v-loading="stepIconLoading">
          <div
            v-for="icon in filteredStepIcons"
            :key="icon.key"
            class="step-icon-item"
            :class="{ selected: selectedStepIcon === icon.url }"
            @click="selectStepIcon(icon)"
          >
            <img :src="icon.url" :alt="icon.fileName" />
            <div class="step-icon-name">{{ icon.fileName }}</div>
          </div>
          <el-empty v-if="!stepIconLoading && filteredStepIcons.length === 0" description="暂无图标" />
        </div>
      </div>
      <template #footer>
        <el-button @click="stepIconPickerVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmStepIcon" :disabled="!selectedStepIcon">确定选择</el-button>
      </template>
    </el-dialog>

    <!-- 场景图标选择对话框（从COS选择） -->
    <el-dialog v-model="sceneIconPickerVisible" title="从COS选择场景图标" width="90%" style="max-width: 900px;" append-to-body v-dialog-drag>
      <div class="scene-icon-picker">
        <div class="scene-icon-picker-header">
          <el-select v-model="sceneIconFolderFilter" placeholder="选择文件夹" clearable style="width: 160px" @change="filterSceneIcons">
            <el-option label="全部文件夹" value="" />
            <el-option v-for="folder in sceneIconFolders" :key="folder" :label="folder || '根目录'" :value="folder" />
          </el-select>
          <el-input v-model="sceneIconSearch" placeholder="搜索图片..." clearable style="width: 200px" @input="filterSceneIcons" />
          <el-button @click="loadSceneIcons" :loading="sceneIconLoading" size="small">刷新</el-button>
          <span class="scene-icon-count" v-if="filteredSceneIcons.length > 0">共 {{ filteredSceneIcons.length }} 张图片</span>
        </div>
        <div class="scene-icon-grid" v-loading="sceneIconLoading">
          <div
            v-for="icon in filteredSceneIcons"
            :key="icon.key"
            class="scene-icon-item"
            :class="{ selected: selectedSceneIcon === icon.url }"
            @click="selectSceneIcon(icon)"
          >
            <el-image :src="icon.url" fit="cover" lazy />
            <div class="scene-icon-info">
              <div class="scene-icon-name">{{ icon.fileName }}</div>
              <div class="scene-icon-tags">
                <el-tag size="small" type="info" v-if="icon.folderPath">{{ icon.folderPath }}</el-tag>
              </div>
            </div>
          </div>
          <el-empty v-if="!sceneIconLoading && filteredSceneIcons.length === 0" description="暂无图片" />
        </div>
      </div>
      <template #footer>
        <el-button @click="sceneIconPickerVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSceneIcon" :disabled="!selectedSceneIcon">确定选择</el-button>
      </template>
    </el-dialog>

    <!-- ========== AI 助手浮动按钮 ========== -->
    <div class="ai-assistant-fab" @click="toggleAISidebar" :class="{ active: aiSidebarVisible }">
      <el-icon :size="24"><MagicStick /></el-icon>
      <span class="fab-label">AI助手</span>
    </div>

    <!-- ========== AI 助手侧边栏 ========== -->
    <el-drawer
      v-model="aiSidebarVisible"
      title="AI 场景生成助手"
      direction="rtl"
      size="420px"
      :close-on-click-modal="false"
    >
      <div class="ai-sidebar-content">
        <!-- 模式切换 -->
        <div class="ai-mode-switch">
          <el-radio-group v-model="aiMode" size="small">
            <el-radio-button label="create">新建场景</el-radio-button>
            <el-radio-button label="modify" :disabled="!currentScene">修改场景</el-radio-button>
            <el-radio-button label="image">生成图标</el-radio-button>
          </el-radio-group>
        </div>

        <!-- 当前场景信息（修改模式） -->
        <div v-if="aiMode === 'modify' && currentScene" class="ai-current-scene">
          <el-icon><FolderOpened /></el-icon>
          <span>当前场景: {{ currentScene.name }}</span>
        </div>

        <!-- ========== 图像管理模式（已禁用AI生成） ========== -->
        <div v-if="aiMode === 'image'" class="ai-image-generator">
          <div class="image-gen-disabled-notice">
            <el-alert
              title="AI图片生成已禁用"
              type="info"
              :closable="false"
              show-icon
            >
              <template #default>
                <p>由于绿幕抠图效果不理想，AI图片生成功能已暂时禁用。</p>
                <p style="margin-top: 8px;">请使用以下方式管理图片：</p>
                <ol style="margin: 8px 0 0 16px; padding: 0;">
                  <li>在「素材管理」中上传图片素材</li>
                  <li>在「场景配置」的步骤选项中点击图片区域从素材库选择</li>
                </ol>
              </template>
            </el-alert>
          </div>

          <!-- 快捷入口 -->
          <div class="quick-actions" style="margin-top: 16px;">
            <el-button type="primary" @click="goToAssets">
              <el-icon><FolderOpened /></el-icon>
              前往素材管理
            </el-button>
          </div>

          <!-- 当前场景信息 -->
          <div v-if="currentScene" class="current-scene-info" style="margin-top: 16px;">
            <el-card shadow="never">
              <template #header>
                <span>当前场景: {{ currentScene.name }}</span>
              </template>
              <p style="font-size: 13px; color: #909399;">
                请在编辑场景时，点击步骤选项的图片区域从COS素材库选择图片。
              </p>
            </el-card>
          </div>
        </div>

        <!-- 对话历史区域（仅在非图像模式显示） -->
        <div class="ai-chat-history" ref="chatHistoryRef" v-show="aiMode !== 'image'">
          <div v-if="aiMessages.length === 0" class="ai-welcome">
            <div class="welcome-icon">🤖</div>
            <h3>AI 场景生成助手</h3>
            <p v-if="aiMode === 'create'">描述您想要创建的场景，我将自动生成完整配置</p>
            <p v-else>描述您想要修改的内容，我将帮您调整当前场景</p>
            <div class="ai-suggestions">
              <div class="suggestion-title">试试这样说:</div>
              <div class="suggestion-item" @click="useSuggestion('帮我创建一个宠物写真场景，包含宠物类型选择、背景风格、滤镜效果等步骤')" v-if="aiMode === 'create'">
                "帮我创建一个宠物写真场景"
              </div>
              <div class="suggestion-item" @click="useSuggestion('创建一个职业形象照场景，需要性别选择、行业选择、着装风格、背景颜色等配置')" v-if="aiMode === 'create'">
                "创建一个职业形象照场景"
              </div>
              <div class="suggestion-item" @click="useSuggestion('添加一个新的背景颜色选项：渐变紫色')" v-if="aiMode === 'modify'">
                "添加一个新的背景颜色选项"
              </div>
              <div class="suggestion-item" @click="useSuggestion('优化当前场景的Prompt模板，使生成效果更专业')" v-if="aiMode === 'modify'">
                "优化Prompt模板"
              </div>
            </div>
          </div>

          <!-- 消息列表 -->
          <div v-for="(msg, idx) in aiMessages" :key="idx" class="ai-message" :class="msg.role">
            <div class="message-avatar">
              <span v-if="msg.role === 'user'">👤</span>
              <span v-else>🤖</span>
            </div>
            <div class="message-content">
              <div class="message-text" v-html="formatMessage(msg.content)"></div>
              <!-- 如果是AI回复且包含生成的配置 -->
              <div v-if="msg.role === 'assistant' && msg.generatedConfig" class="ai-config-preview">
                <div class="config-preview-header">
                  <el-icon><Document /></el-icon>
                  <span>已生成场景配置</span>
                </div>
                <div class="config-preview-info">
                  <div>场景: {{ msg.generatedConfig.scene?.name || '未命名' }}</div>
                  <div>步骤数: {{ msg.generatedConfig.steps?.length || 0 }}</div>
                  <div v-if="msg.generatedConfig.scene?.icon" class="preview-icon">
                    <img :src="msg.generatedConfig.scene.icon" alt="场景图标" style="width: 40px; height: 40px; border-radius: 4px;" />
                  </div>

                  <!-- 图片生成任务列表（待确认） -->
                  <div v-if="msg.imageTasksPending" class="image-tasks-pending">
                    <div class="tasks-header">
                      <el-icon><PictureFilled /></el-icon>
                      <span>需要生成 {{ msg.imageTasks?.length || 0 }} 张图片</span>
                    </div>
                    <div class="tasks-list">
                      <div v-for="(task, taskIdx) in msg.imageTasks" :key="taskIdx" class="task-item">
                        <el-icon><Picture /></el-icon>
                        <span>{{ task.label }}</span>
                      </div>
                    </div>
                    <div class="tasks-confirm">
                      <el-button type="primary" size="small" @click="confirmImageGeneration(idx)">
                        确认生成（消耗 {{ msg.imageTasks?.length || 0 }} 次调用）
                      </el-button>
                      <el-button size="small" @click="skipImageGeneration(idx)">
                        跳过图片生成
                      </el-button>
                    </div>
                  </div>

                  <!-- 图片生成进度 -->
                  <div v-if="msg.generatingImages" class="generating-images-progress">
                    <div class="progress-header">
                      <el-icon class="is-loading"><Loading /></el-icon>
                      <span>正在生成图标和示意图 ({{ msg.imageProgress?.current || 0 }}/{{ msg.imageProgress?.total || 0 }})</span>
                    </div>
                    <div class="progress-tasks">
                      <div v-for="(task, taskIdx) in msg.imageTasks" :key="taskIdx" class="progress-task-item" :class="task.status">
                        <el-icon v-if="task.status === 'completed'"><CircleCheck /></el-icon>
                        <el-icon v-else-if="task.status === 'processing'" class="is-loading"><Loading /></el-icon>
                        <el-icon v-else><Clock /></el-icon>
                        <span>{{ task.label }}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="config-preview-actions">
                  <el-button type="primary" size="small" @click="applyGeneratedConfig(msg.generatedConfig)" :disabled="msg.generatingImages || msg.imageTasksPending">
                    应用配置
                  </el-button>
                  <el-button size="small" @click="previewGeneratedConfig(msg.generatedConfig)">
                    预览详情
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 加载中状态 -->
          <div v-if="aiLoading" class="ai-message assistant">
            <div class="message-avatar">🤖</div>
            <div class="message-content">
              <div class="message-loading">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="ai-input-area">
          <el-input
            v-model="aiInput"
            type="textarea"
            :rows="3"
            :placeholder="aiMode === 'create' ? '描述您想创建的场景...' : '描述您想修改的内容...'"
            @keydown.enter.ctrl="sendAIMessage"
            :disabled="aiLoading"
          />
          <div class="ai-input-actions">
            <span class="input-hint">Ctrl + Enter 发送</span>
            <el-button type="primary" @click="sendAIMessage" :loading="aiLoading" :disabled="!aiInput.trim()">
              发送
            </el-button>
          </div>
        </div>
      </div>
    </el-drawer>

    <!-- AI 配置预览对话框 -->
    <el-dialog v-model="aiPreviewVisible" title="AI 生成配置预览" width="80%" style="max-width: 900px;" append-to-body>
      <div class="ai-config-detail" v-if="aiPreviewConfig">
        <el-tabs>
          <el-tab-pane label="场景信息">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="场景ID">{{ aiPreviewConfig.scene?.scene_key }}</el-descriptions-item>
              <el-descriptions-item label="场景名称">{{ aiPreviewConfig.scene?.name }}</el-descriptions-item>
              <el-descriptions-item label="英文名称">{{ aiPreviewConfig.scene?.name_en }}</el-descriptions-item>
              <el-descriptions-item label="消耗醒币">{{ aiPreviewConfig.scene?.points_cost }}</el-descriptions-item>
              <el-descriptions-item label="场景图标">
                <img v-if="aiPreviewConfig.scene?.icon" :src="aiPreviewConfig.scene.icon" alt="场景图标" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover;" />
                <span v-else class="no-icon-hint">暂无图标</span>
              </el-descriptions-item>
              <el-descriptions-item label="图标描述">{{ aiPreviewConfig.scene?.icon_description || '无' }}</el-descriptions-item>
              <el-descriptions-item label="中文描述" :span="2">{{ aiPreviewConfig.scene?.description }}</el-descriptions-item>
              <el-descriptions-item label="英文描述" :span="2">{{ aiPreviewConfig.scene?.description_en }}</el-descriptions-item>
            </el-descriptions>
          </el-tab-pane>
          <el-tab-pane :label="`步骤配置 (${aiPreviewConfig.steps?.length || 0})`">
            <div v-for="(step, idx) in aiPreviewConfig.steps" :key="idx" class="preview-step-card">
              <div class="preview-step-header">
                <span class="step-num">{{ idx + 1 }}</span>
                <span class="step-name">{{ step.title }} ({{ step.step_key }})</span>
                                <el-tag size="small">{{ getComponentTypeLabel(step.component_type) }}</el-tag>
              </div>
              <div class="preview-step-options" v-if="step.options?.length">
                <div class="option-grid">
                  <div v-for="opt in step.options" :key="opt.option_key" class="option-item">
                    <img v-if="opt.image" :src="opt.image" :alt="opt.label" class="option-preview-image" />
                    <div v-else class="option-no-image">
                      <el-icon><PictureFilled /></el-icon>
                    </div>
                    <div class="option-label">{{ opt.label }}</div>
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane label="Prompt模板">
            <div class="preview-prompt">
              <div class="prompt-label">正向提示词:</div>
              <pre>{{ aiPreviewConfig.prompt_template?.template }}</pre>
              <div class="prompt-label" v-if="aiPreviewConfig.prompt_template?.negative_prompt">负面提示词:</div>
              <pre v-if="aiPreviewConfig.prompt_template?.negative_prompt">{{ aiPreviewConfig.prompt_template.negative_prompt }}</pre>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
      <template #footer>
        <el-button @click="aiPreviewVisible = false">关闭</el-button>
        <el-button type="primary" @click="applyGeneratedConfig(aiPreviewConfig); aiPreviewVisible = false">
          应用此配置
        </el-button>
      </template>
    </el-dialog>

    <!-- 品级方案管理弹窗 -->
    <el-dialog
      v-model="gradeSchemeManagerVisible"
      title="品级方案管理"
      width="900px"
      destroy-on-close
    >
      <grade-scheme-manager
        v-if="gradeSchemeManagerVisible && form.id && currentStep?.step_key"
        :scene-id="String(form.id)"
        :step-key="currentStep.step_key"
        @change="onGradeSchemeManagerChange"
      />
      <template #footer>
        <el-button @click="gradeSchemeManagerVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, FolderOpened, InfoFilled, MagicStick, Document, CircleCheckFilled, PictureFilled, Loading, Picture, CircleCheck, Clock, Upload, User } from '@element-plus/icons-vue'
import Sortable from 'sortablejs'
import draggable from 'vuedraggable'
import request from '@/api'
import { translateToEnglish, batchTranslateToEnglish } from '@/utils/translate'
import DrawPoolManager from '@/components/DrawPoolManager.vue'
import GradeSchemeManager from '@/components/GradeSchemeManager.vue'
import PromptTemplateEditor from '@/components/PromptTemplateEditor.vue'

const loading = ref(false)
const saving = ref(false)
const savingSteps = ref(false)
const savingPrompt = ref(false)
const scenes = ref([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const currentScene = ref(null)
const steps = ref([])
const currentStepIndex = ref(-1)
const statusFilter = ref('all')
const activeTab = ref('basic')  // 当前激活的Tab

// COS图片选择相关
const cosPickerVisible = ref(false)
const cosLoading = ref(false)
const cosImages = ref([])
const filteredCosImages = ref([])
const cosFolders = ref([])
const cosSearchKeyword = ref('')
const cosFilterFolder = ref('')
const cosGenderFilter = ref('')  // 性别筛选（当步骤启用gender_based时使用）
const selectedCosImage = ref('')
const currentOptionIndex = ref(-1)  // 当前正在编辑的选项索引

// 步骤图标选择相关
const stepIconPickerVisible = ref(false)
const stepIconLoading = ref(false)
const stepIcons = ref([])
const stepIconSearch = ref('')
const selectedStepIcon = ref('')

// 场景图标选择相关（从COS选择）
const sceneIconPickerVisible = ref(false)
const sceneIconLoading = ref(false)
const sceneIcons = ref([])
const sceneIconFolders = ref([])  // 文件夹列表
const sceneIconSearch = ref('')
const sceneIconFolderFilter = ref('')  // 文件夹筛选
const selectedSceneIcon = ref('')
const filteredSceneIcons = ref([])  // 筛选后的图标列表

// 品级方案相关
const gradeSchemes = ref([])
const gradeSchemeManagerVisible = ref(false)
const selectedGradeScheme = computed(() => {
  if (!currentStep.value?.config?.gradeSchemeId) return null
  return gradeSchemes.value.find(s => s.id === currentStep.value.config.gradeSchemeId)
})

// 显示品级方案管理弹窗
function showGradeSchemeManager() {
  if (!form.id || !currentStep.value?.step_key) {
    ElMessage.warning('请先保存场景')
    return
  }
  gradeSchemeManagerVisible.value = true
}

// 品级方案管理器变化回调
function onGradeSchemeManagerChange() {
  loadGradeSchemes()
}

// 加载品级方案列表
async function loadGradeSchemes() {
  try {
    const res = await request.get('/admin/grade-schemes')
    const schemes = res.data.list || []
    // 为每个方案加载品级详情
    for (const scheme of schemes) {
      try {
        const detailRes = await request.get(`/admin/grade-schemes/${scheme.id}`)
        if (detailRes.code === 0 && detailRes.data) {
          scheme.grades = detailRes.data.grades || []
        }
      } catch (e) {
        scheme.grades = []
      }
    }
    gradeSchemes.value = schemes
  } catch (error) {
    console.error('加载品级方案失败:', error)
  }
}

// 品级方案选择变化
function onGradeSchemeChange(schemeId) {
  if (currentStep.value) {
    if (!currentStep.value.config) {
      currentStep.value.config = {}
    }
    currentStep.value.config.gradeSchemeId = schemeId
  }
}

const filteredStepIcons = computed(() => {
  if (!stepIconSearch.value) return stepIcons.value
  const keyword = stepIconSearch.value.toLowerCase()
  return stepIcons.value.filter(icon => icon.fileName.toLowerCase().includes(keyword))
})

// 筛选场景图标（改为函数式，支持多条件筛选）
function filterSceneIcons() {
  let result = sceneIcons.value

  // 文件夹筛选
  if (sceneIconFolderFilter.value) {
    result = result.filter(icon => icon.folderPath === sceneIconFolderFilter.value)
  }

  // 关键词搜索
  if (sceneIconSearch.value) {
    const keyword = sceneIconSearch.value.toLowerCase()
    result = result.filter(icon =>
      icon.fileName?.toLowerCase().includes(keyword) ||
      icon.key?.toLowerCase().includes(keyword) ||
      icon.folderPath?.toLowerCase().includes(keyword)
    )
  }

  filteredSceneIcons.value = result
}

// 上传配置
const uploadUrl = '/api/upload/icon'
const uploadHeaders = computed(() => ({
  Authorization: `Bearer ${localStorage.getItem('admin_token')}`
}))

const promptForm = reactive({
  id: null,
  name: '',
  template: '',
  negative_prompt: '',
  segments: null,
  model_config: null,
  is_active: true
})

// 用于 PromptTemplateEditor 的双向绑定数据
const promptFormData = ref({
  name: '',
  template: '',
  negative_prompt: '',
  segments: null,
  model_config: null
})

const form = reactive({
  id: '',
  name: '',
  name_en: '',
  description: '',
  description_en: '',
  icon: '',
  status: 'active',
  is_review_safe: true,
  points_cost: 50,
  sort_order: 0
})

const rules = {
  id: [{ required: true, message: '请输入场景ID', trigger: 'blur' }],
  name: [{ required: true, message: '请输入场景名称', trigger: 'blur' }]
}

// 筛选后的场景列表
const filteredScenes = computed(() => {
  if (statusFilter.value === 'all') {
    return scenes.value
  }
  return scenes.value.filter(s => s.status === statusFilter.value)
})

const currentStep = computed(() => {
  return currentStepIndex.value >= 0 ? steps.value[currentStepIndex.value] : null
})

// 选项性别筛选
const optionGenderFilter = ref('')

// 筛选后的选项列表（根据性别筛选）
const filteredOptions = computed(() => {
  if (!currentStep.value || !currentStep.value.options) return []
  if (!optionGenderFilter.value) {
    return currentStep.value.options
  }
  return currentStep.value.options.filter(opt => opt.gender === optionGenderFilter.value)
})

const availableVars = computed(() => {
  return steps.value.map(s => s.step_key).filter(k => k && k !== 'upload')
})

function getVarDisplay(v) {
  return '{{' + v + '}}'
}

// 组件类型中英文映射
const componentTypeMap = {
  image_upload: '图片上传',
  gender_select: '性别选择',
  radio: '单选框',
  tags: '标签选择',
  spec_select: '规格选择',
  color_picker: '颜色选择',
  image_tags: '图片标签',
  slider: '滑块',
  random_dice: '摇骰子'
}

function getComponentTypeLabel(type) {
  return componentTypeMap[type] || type
}

function filterScenes() {
  // 筛选由 computed 自动处理
}

async function loadScenes() {
  loading.value = true
  try {
    const res = await request.get('/config/admin/scenes')
    // 映射字段名：数据库用price，前端显示用points_cost
    scenes.value = (res.data || []).map(s => ({
      ...s,
      points_cost: s.price || 50
    }))
    // 初始化拖动排序
    initSortable()
  } catch (error) {
    console.error('加载场景失败:', error)
    ElMessage.error('加载场景列表失败')
  } finally {
    loading.value = false
  }
}

// 初始化拖动排序
function initSortable() {
  setTimeout(() => {
    const tableBody = document.querySelector('.scene-list .el-table__body-wrapper tbody')
    if (tableBody) {
      new Sortable(tableBody, {
        handle: '.drag-handle',
        animation: 150,
        onEnd: async (evt) => {
          const { oldIndex, newIndex } = evt
          if (oldIndex !== newIndex) {
            // 更新数组顺序
            const item = scenes.value.splice(oldIndex, 1)[0]
            scenes.value.splice(newIndex, 0, item)
            // 保存排序
            await saveSort()
          }
        }
      })
    }
  }, 100)
}

function showAddDialog() {
  isEdit.value = false
  Object.assign(form, {
    id: '', name: '', name_en: '',
    description: '', description_en: '',
    icon: '', status: 'active', is_review_safe: true,
    points_cost: 50, sort_order: scenes.value.length
  })
  dialogVisible.value = true
}

async function editScene(row) {
  isEdit.value = true
  currentScene.value = row
  Object.assign(form, row)
  form.is_review_safe = row.is_review_safe === 1
  activeTab.value = 'basic'

  // 加载步骤数据
  try {
    const stepsRes = await request.get(`/config/admin/scene/${row.id}/steps`)
    steps.value = (stepsRes.data || []).map(s => {
      // 解析config JSON
      let config = {}
      try {
        config = s.config ? JSON.parse(s.config) : {}
      } catch (e) {
        config = {}
      }
      // 解析选项中的metadata（包含尺寸等扩展属性）
      const options = (s.options || []).map(opt => {
        let metadata = {}
        try {
          metadata = opt.metadata ? JSON.parse(opt.metadata) : {}
        } catch (e) {
          metadata = {}
        }
        return {
          ...opt,
          width: metadata.width || null,
          height: metadata.height || null
        }
      })
      // 确保每个步骤只有一个默认选项
      let hasDefault = false
      options.forEach(opt => {
        if (opt.is_default === 1) {
          if (hasDefault) {
            opt.is_default = 0  // 已有默认项，取消这个
          } else {
            hasDefault = true
          }
        }
      })
      // 如果没有默认选项，设置第一个为默认
      if (!hasDefault && options.length > 0) {
        options[0].is_default = 1
      }
      return {
        ...s,
        config,  // 使用解析后的 config 对象，替换原始 JSON 字符串
        is_required: s.is_required === 1,
        is_visible: s.is_visible === 1,
        gender_based: s.gender_based === 1 || s.gender_based === true || config.gender_based || false,  // 优先从根级别读取
        icon: s.icon || config.icon || '',  // 优先从根级别读取图标
        free_count: s.free_count !== undefined ? s.free_count : 1,  // 摇骰子免费次数
        cost_per_roll: s.cost_per_roll !== undefined ? s.cost_per_roll : 10,  // 摇骰子每次消耗
        options
      }
    })

    // 为每个步骤加载品级方案映射
    for (const step of steps.value) {
      if (step.step_key) {
        try {
          const mappingRes = await request.get(`/admin/grade-schemes/mapping/${row.id}/${step.step_key}`)
          if (mappingRes.code === 0 && mappingRes.data?.scheme_id) {
            step.config.gradeSchemeId = mappingRes.data.scheme_id
          }
        } catch (e) {
          // 忽略映射加载错误
        }
      }
    }

    currentStepIndex.value = steps.value.length > 0 ? 0 : -1
  } catch (error) {
    console.error('加载步骤失败:', error)
    steps.value = []
    currentStepIndex.value = -1
  }

  // 加载Prompt数据
  try {
    const promptRes = await request.get(`/config/admin/prompts/${row.id}`)
    const prompts = promptRes.data || []
    if (prompts.length > 0) {
      Object.assign(promptForm, prompts[0])
      promptForm.is_active = prompts[0].is_active === 1
      // 同步到 promptFormData，优先使用 template_content
      promptFormData.value = {
        name: prompts[0].name || '',
        template: prompts[0].template_content || prompts[0].template || '',
        negative_prompt: prompts[0].negative_prompt || '',
        segments: prompts[0].segments || null,
        model_config: prompts[0].model_config || null
      }
    } else {
      Object.assign(promptForm, {
        id: null,
        name: `${row.name}模板`,
        template: '',
        negative_prompt: '',
        segments: null,
        model_config: null,
        is_active: true
      })
      promptFormData.value = {
        name: `${row.name}模板`,
        template: '',
        negative_prompt: '',
        segments: null,
        model_config: null
      }
    }
  } catch (error) {
    console.error('加载Prompt失败:', error)
    Object.assign(promptForm, {
      id: null,
      name: `${row.name}模板`,
      template: '',
      negative_prompt: '',
      segments: null,
      model_config: null,
      is_active: true
    })
    promptFormData.value = {
      name: `${row.name}模板`,
      template: '',
      negative_prompt: '',
      segments: null,
      model_config: null
    }
  }

  dialogVisible.value = true
}

// 表单内图标上传成功
function handleFormIconUploadSuccess(response) {
  if (response.code === 200 && response.data?.url) {
    form.icon = response.data.url
    ElMessage.success('图标上传成功')
  } else {
    ElMessage.error(response.message || '上传失败')
  }
}

function handleFormIconUploadError() {
  ElMessage.error('图标上传失败')
}

function beforeIconUpload(file) {
  const isImage = file.type.startsWith('image/')
  const isLt500K = file.size / 1024 < 500

  if (!isImage) {
    ElMessage.error('只能上传图片文件!')
    return false
  }
  if (!isLt500K) {
    ElMessage.error('图片大小不能超过 500KB!')
    return false
  }
  return true
}

async function saveAll() {
  // 验证基本信息表单
  try {
    await formRef.value.validate()
  } catch { return }

  saving.value = true
  try {
    // 1. 保存基本信息
    const data = {
      ...form,
      scene_key: form.id,
      price: form.points_cost,
      is_review_safe: form.is_review_safe ? 1 : 0,
      use_dynamic_render: 1
    }
    if (isEdit.value) {
      data.id = form.id
    }
    await request.post('/config/admin/scene', data)

    // 2. 如果是编辑模式，使用批量保存API（一次性保存步骤+选项+Prompt）
    if (isEdit.value && (steps.value.length > 0 || promptForm.template)) {
      // 准备步骤数据 - icon 和 gender_based 放在根级别传递给后端
      const stepsData = steps.value.map(step => ({
        ...step,
        icon: step.icon || '',
        gender_based: step.gender_based || false,
        config: step.config || {}
      }))

      // 准备Prompt数据 - 从 promptFormData 同步
      if (promptFormData.value) {
        promptForm.name = promptFormData.value.name || promptForm.name
        promptForm.template = promptFormData.value.template || ''
        promptForm.negative_prompt = promptFormData.value.negative_prompt || ''
        promptForm.segments = promptFormData.value.segments || null
        promptForm.model_config = promptFormData.value.model_config || null
      }

      const promptData = promptForm.template ? {
        ...promptForm,
        scene_id: form.id
      } : null

      // 一次性批量保存
      const payload = {
        steps: stepsData,
        prompt: promptData
      }
      // 调试：输出请求体积和icon字段
      const payloadStr = JSON.stringify(payload)
      console.log('[保存调试] 总体积:', (payloadStr.length / 1024).toFixed(2), 'KB')
      console.log('[保存调试] 步骤数:', stepsData.length)
      stepsData.forEach((step, i) => {
        console.log(`[保存调试] 步骤${i + 1} "${step.title}": icon="${step.icon}", gender_based=${step.gender_based}`)
      })
      await request.post(`/config/admin/scene/${form.id}/batch-save`, payload)
    }

    ElMessage.success('保存成功')
    dialogVisible.value = false
    loadScenes()
  } catch (error) {
    ElMessage.error('保存失败: ' + (error.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

async function updateScene(row) {
  try {
    const data = {
      ...row,
      price: row.points_cost || row.price,
      use_dynamic_render: 1  // 全部动态渲染
    }
    await request.post('/config/admin/scene', data)
    ElMessage.success('更新成功')
  } catch (error) {
    ElMessage.error('更新失败')
    loadScenes()
  }
}

// 设置场景状态
async function setStatus(row, status) {
  if (row.status === status) return
  const oldStatus = row.status
  row.status = status  // 乐观更新UI

  try {
    const res = await request.post('/config/admin/scene/status', {
      id: row.id,
      status: status
    })
    if (res.code === 200 || res.code === 0) {
      ElMessage.success('状态更新成功')
    } else {
      // 更新失败，恢复原状态
      row.status = oldStatus
      ElMessage.error(res.message || '状态更新失败')
    }
  } catch (error) {
    // 请求失败，恢复原状态
    row.status = oldStatus
    ElMessage.error(error.message || '状态更新失败')
  }
}

async function deleteScene(row) {
  try {
    await ElMessageBox.confirm(`确定删除场景"${row.name}"吗？`, '删除确认', { type: 'warning' })
    await request.delete(`/config/admin/scene/${row.id}`)
    ElMessage.success('删除成功')
    loadScenes()
  } catch {}
}

async function saveSort() {
  const orders = scenes.value.map((s, i) => ({ id: s.id, sort_order: i }))
  try {
    await request.post('/config/admin/scenes/sort', { scenes: orders })
    ElMessage.success('排序已更新')
  } catch {
    ElMessage.error('排序更新失败')
  }
}

// 步骤配置辅助函数
function selectStep(index) {
  currentStepIndex.value = index
  // 确保 config 对象存在
  const step = steps.value[index]
  if (step && !step.config) {
    step.config = {}
  }
}

function addStep() {
  const newStep = {
    id: null,
    step_order: steps.value.length + 1,
    step_key: '',
    title: '新步骤',
    title_en: '',
    icon: '',  // 步骤图标
    component_type: 'radio',
    is_required: false,
    is_visible: true,
    gender_based: false,  // 默认不启用性别分类
    free_count: 1,  // 摇骰子免费次数
    cost_per_roll: 10,  // 摇骰子每次消耗醒币
    config: {},
    options: []
  }
  steps.value.push(newStep)
  currentStepIndex.value = steps.value.length - 1
}

function deleteStep(index) {
  steps.value.splice(index, 1)
  if (currentStepIndex.value >= steps.value.length) {
    currentStepIndex.value = steps.value.length - 1
  }
}

function addOption() {
  if (!currentStep.value) return
  // 自动生成唯一Key
  const autoKey = `opt_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 4)}`
  // 如果当前没有选项，新选项自动设为默认
  const isFirstOption = currentStep.value.options.length === 0
  const newOption = {
    option_key: autoKey,
    label: '',
    label_en: '',
    color: '',
    image: '',
    prompt_text: '',
    is_default: isFirstOption ? 1 : 0
  }
  // 规格选择组件添加默认尺寸（毫米）
  if (currentStep.value.component_type === 'spec_select') {
    newOption.width = 25
    newOption.height = 35
  }
  currentStep.value.options.push(newOption)
}

function deleteOption(index) {
  const options = currentStep.value.options
  const deletingDefault = options[index].is_default === 1
  options.splice(index, 1)
  // 如果删除的是默认项且还有其他选项，将第一个设为默认
  if (deletingDefault && options.length > 0 && !options.some(o => o.is_default === 1)) {
    options[0].is_default = 1
  }
}

// 通过选项对象删除（支持筛选视图）
function deleteOptionByOpt(opt) {
  const index = currentStep.value.options.indexOf(opt)
  if (index >= 0) {
    deleteOption(index)
  }
}

// 设置默认选项（单选模式，必须有一个默认）
function setDefaultOption(opt) {
  if (!currentStep.value) return
  // 取消所有其他选项的默认状态
  currentStep.value.options.forEach(o => {
    o.is_default = 0
  })
  // 设置当前选项为默认
  opt.is_default = 1
}

function onStepReorder() {
  steps.value.forEach((s, i) => {
    s.step_order = i + 1
  })
}

// Prompt辅助函数
function insertVar(varName) {
  promptForm.template += `{{${varName}}}`
}

// 当前编辑的选项对象引用
const currentEditingOption = ref(null)

// 显示COS图片选择器
async function showCosImagePicker(optionIndex) {
  currentOptionIndex.value = optionIndex
  const opt = currentStep.value.options[optionIndex]
  currentEditingOption.value = opt
  selectedCosImage.value = opt?.image || ''

  // 如果当前步骤启用了性别分类，且选项有性别属性，则自动设置性别筛选
  if (currentStep.value?.gender_based && opt?.gender) {
    cosGenderFilter.value = opt.gender
  } else {
    cosGenderFilter.value = ''
  }

  cosPickerVisible.value = true

  // 如果还没加载过图片，则加载
  if (cosImages.value.length === 0) {
    await loadCosImages()
  } else {
    filterCosImages()
  }
}

// 通过选项对象显示COS选择器（支持筛选视图）
async function showCosImagePickerByOpt(opt) {
  currentEditingOption.value = opt
  currentOptionIndex.value = -1  // 使用对象引用而非索引
  selectedCosImage.value = opt.image || ''

  // 如果当前步骤启用了性别分类，且选项有性别属性，则自动设置性别筛选
  if (currentStep.value?.gender_based && opt.gender) {
    cosGenderFilter.value = opt.gender
  } else {
    cosGenderFilter.value = ''
  }

  cosPickerVisible.value = true

  if (cosImages.value.length === 0) {
    await loadCosImages()
  } else {
    // 已有图片时也需要重新筛选
    filterCosImages()
  }
}

// 加载COS图片列表（从素材桶获取所有素材）
async function loadCosImages() {
  cosLoading.value = true
  try {
    // 使用素材管理API获取所有图片
    const res = await request.get('/photos/cos-images')
    if (res.code === 200 || res.code === 0) {
      cosImages.value = res.data || []
      // 使用API返回的文件夹列表
      cosFolders.value = res.folders || []
      filterCosImages()
    } else {
      console.warn('photos/cos-images返回非200:', res)
      ElMessage.warning('素材加载失败，请检查COS配置')
    }
  } catch (error) {
    console.error('加载COS图片失败:', error)
    ElMessage.error('加载图片列表失败: ' + (error.message || '网络错误'))
  } finally {
    cosLoading.value = false
  }
}

// 筛选COS图片
function filterCosImages() {
  let result = cosImages.value

  // 性别筛选（当步骤启用gender_based时，按文件夹路径中的male/female筛选）
  if (cosGenderFilter.value && currentStep.value?.gender_based) {
    result = result.filter(img => {
      // 检查文件夹路径是否包含性别标识
      const folderPath = (img.folderPath || '').toLowerCase()
      const category = (img.category || '').toLowerCase()
      return folderPath.includes(cosGenderFilter.value) || category === cosGenderFilter.value
    })
  }

  // 文件夹筛选（按完整路径）
  if (cosFilterFolder.value) {
    result = result.filter(img => img.folderPath === cosFilterFolder.value)
  }

  // 关键词搜索
  if (cosSearchKeyword.value) {
    const keyword = cosSearchKeyword.value.toLowerCase()
    result = result.filter(img =>
      img.fileName?.toLowerCase().includes(keyword) ||
      img.key?.toLowerCase().includes(keyword)
    )
  }

  filteredCosImages.value = result
}

// 选择COS图片
function selectCosImage(img) {
  selectedCosImage.value = img.url
}

// 确认选择COS图片
function confirmCosImage() {
  if (selectedCosImage.value) {
    // 优先使用对象引用
    if (currentEditingOption.value) {
      currentEditingOption.value.image = selectedCosImage.value
      ElMessage.success('图片已选择')
    } else if (currentOptionIndex.value >= 0) {
      currentStep.value.options[currentOptionIndex.value].image = selectedCosImage.value
      ElMessage.success('图片已选择')
    }
  }
  cosPickerVisible.value = false
  currentEditingOption.value = null
}

// 显示步骤图标选择器
async function showStepIconPicker() {
  selectedStepIcon.value = currentStep.value?.icon || ''
  stepIconPickerVisible.value = true

  // 加载图标列表（从素材管理的UI图标）
  if (stepIcons.value.length === 0) {
    await loadStepIcons()
  }
}

// 加载步骤图标（从素材管理API获取UI图标）
async function loadStepIcons() {
  stepIconLoading.value = true
  try {
    const res = await request.get('/assets/list')
    if (res.code === 200 || res.code === 0) {
      // 获取UI图标
      stepIcons.value = res.data?.uiIcons || []
    }
  } catch (error) {
    console.error('加载图标失败:', error)
    ElMessage.error('加载图标列表失败')
  } finally {
    stepIconLoading.value = false
  }
}

// 选择步骤图标
function selectStepIcon(icon) {
  selectedStepIcon.value = icon.url
}

// 确认选择步骤图标
function confirmStepIcon() {
  if (selectedStepIcon.value && currentStep.value) {
    currentStep.value.icon = selectedStepIcon.value
    ElMessage.success('图标已选择')
  }
  stepIconPickerVisible.value = false
}

// 显示场景图标选择器（从COS选择）
async function showSceneIconPicker() {
  selectedSceneIcon.value = form.icon || ''
  sceneIconFolderFilter.value = ''  // 重置筛选
  sceneIconSearch.value = ''
  sceneIconPickerVisible.value = true

  // 加载COS图片作为场景图标
  if (sceneIcons.value.length === 0) {
    await loadSceneIcons()
  } else {
    filterSceneIcons()
  }
}

// 加载场景图标（从COS素材库获取所有图片）
async function loadSceneIcons() {
  sceneIconLoading.value = true
  try {
    // 获取整个COS素材桶的图片
    const res = await request.get('/photos/cos-images')
    if (res.code === 200 || res.code === 0) {
      // 获取所有图片
      sceneIcons.value = res.data || []
      // 获取文件夹列表
      sceneIconFolders.value = res.folders || []
      // 初始筛选
      filterSceneIcons()
    }
  } catch (error) {
    console.error('加载场景图标失败:', error)
    ElMessage.error('加载图标列表失败')
  } finally {
    sceneIconLoading.value = false
  }
}

// 选择场景图标
function selectSceneIcon(icon) {
  selectedSceneIcon.value = icon.url
}

// 确认选择场景图标
function confirmSceneIcon() {
  if (selectedSceneIcon.value) {
    form.icon = selectedSceneIcon.value
    ElMessage.success('图标已选择')
  }
  sceneIconPickerVisible.value = false
}

// ========== 翻译功能（调用腾讯翻译API） ==========
const translating = reactive({
  name: false,
  desc: false,
  step: false,
  options: false
})

// 翻译场景名称
async function translateSceneName() {
  if (!form.name) {
    ElMessage.warning('请先输入中文名称')
    return
  }
  translating.name = true
  try {
    form.name_en = await translateToEnglish(form.name)
    ElMessage.success('翻译成功')
  } catch (e) {
    ElMessage.error('翻译失败')
  } finally {
    translating.name = false
  }
}

// 翻译场景描述
async function translateSceneDesc() {
  if (!form.description) {
    ElMessage.warning('请先输入中文描述')
    return
  }
  translating.desc = true
  try {
    form.description_en = await translateToEnglish(form.description)
    ElMessage.success('翻译成功')
  } catch (e) {
    ElMessage.error('翻译失败')
  } finally {
    translating.desc = false
  }
}

// 翻译步骤标题
async function translateStepTitle() {
  if (!currentStep.value) return
  if (!currentStep.value.title) {
    ElMessage.warning('请先输入中文标题')
    return
  }
  translating.step = true
  try {
    currentStep.value.title_en = await translateToEnglish(currentStep.value.title)
    ElMessage.success('翻译成功')
  } catch (e) {
    ElMessage.error('翻译失败')
  } finally {
    translating.step = false
  }
}

// 批量翻译所有选项
async function translateAllOptions() {
  if (!currentStep.value || !currentStep.value.options || currentStep.value.options.length === 0) {
    ElMessage.warning('当前步骤没有选项')
    return
  }
  
  // 收集需要翻译的文本
  const textsToTranslate = currentStep.value.options
    .filter(opt => opt.label && !opt.label_en)
    .map(opt => opt.label)
  
  if (textsToTranslate.length === 0) {
    ElMessage.warning('没有需要翻译的选项')
    return
  }

  translating.options = true
  try {
    const results = await batchTranslateToEnglish(textsToTranslate)
    
    // 应用翻译结果
    let idx = 0
    currentStep.value.options.forEach(opt => {
      if (opt.label && !opt.label_en) {
        opt.label_en = results[idx]?.translated || opt.label
        idx++
      }
    })
    
    ElMessage.success(`已翻译 ${results.length} 个选项`)
  } catch (e) {
    ElMessage.error('批量翻译失败')
  } finally {
    translating.options = false
  }
}

// 翻译单个选项
async function translateOption(opt) {
  if (!opt.label) {
    ElMessage.warning('请先输入中文名称')
    return
  }
  try {
    opt.label_en = await translateToEnglish(opt.label)
    ElMessage.success('翻译成功')
  } catch (e) {
    ElMessage.error('翻译失败')
  }
}

// ========== AI 助手功能 ==========
const aiSidebarVisible = ref(false)
const aiMode = ref('create') // 'create', 'modify' 或 'image'
const aiInput = ref('')
const aiLoading = ref(false)
const aiMessages = ref([])
const chatHistoryRef = ref(null)
const aiPreviewVisible = ref(false)
const aiPreviewConfig = ref(null)

// ========== 图像生成功能 ==========
const imageGenLoading = ref(false)
const imageGenResult = ref(null)
const imageGenForm = reactive({
  description: '',
  type: 'scene',  // 'scene' 或 'step'
})
const batchGenStepKey = ref('')
const batchGenLoading = ref(false)

// 切换 AI 侧边栏
function toggleAISidebar() {
  aiSidebarVisible.value = !aiSidebarVisible.value

  // 打开时显示版本信息
  if (aiSidebarVisible.value) {
    console.log('%c🤖 AI场景生成助手已更新', 'color: #67C23A; font-size: 16px; font-weight: bold;')
    console.log('%c版本: v2.3.0 (2026-01-20 12:22:00)', 'color: #409EFF; font-size: 14px;')
    console.log('%c✨ 新功能:', 'color: #E6A23C; font-size: 14px; font-weight: bold;')
    console.log('  • 禁用AI图片生成功能（绿幕抠图效果不理想）')
    console.log('  • 改为使用占位图，请通过素材管理上传图片')
    console.log('  • 新增「素材管理」→「场景素材」TAB')
    console.log('  • 在场景配置中点击图片区域从素材库选择')
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #909399;')
  }
}

// 使用建议
function useSuggestion(text) {
  aiInput.value = text
}

// 格式化消息（简单处理换行）
function formatMessage(content) {
  if (!content) return ''
  return content.replace(/\n/g, '<br>')
}

// 滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (chatHistoryRef.value) {
      chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight
    }
  })
}

// 构建图片生成任务列表（已禁用AI生成，返回空数组）
function buildImageTasks(config) {
  // AI图片生成已禁用，返回空任务列表
  // 用户需要通过素材管理上传图片，然后在场景配置中选择
  return []
}

// 跳转到素材管理页面
function goToAssets() {
  // 使用 Vue Router 跳转到素材管理页面
  window.location.href = '/admin/#/assets'
}

// 用户确认生成图片
async function confirmImageGeneration(msgIndex) {
  const msg = aiMessages.value[msgIndex]
  if (!msg || !msg.generatedConfig) return

  // 更新消息状态：开始生成
  msg.imageTasksPending = false
  msg.generatingImages = true
  msg.imageProgress = {
    current: 0,
    total: msg.imageTasks.length
  }

  try {
    // 调用图片生成函数，传入进度回调
    const configWithImages = await generateConfigImagesWithProgress(
      msg.generatedConfig,
      msg.imageTasks,
      (taskIndex, status) => {
        // 更新任务状态
        msg.imageTasks[taskIndex].status = status
        if (status === 'completed') {
          msg.imageProgress.current++
        }
      }
    )

    // 生成完成，更新消息
    msg.generatedConfig = configWithImages
    msg.generatingImages = false
    msg.content = aiMode.value === 'create'
      ? `已为您生成「${configWithImages.scene?.name || '新场景'}」的完整配置，包含 ${configWithImages.steps?.length || 0} 个步骤。所有图片已生成完成，点击下方按钮可预览详情或直接应用。`
      : `已根据您的要求修改了场景配置。所有图片已生成完成，点击下方按钮查看修改结果。`

    ElMessage.success('图片生成完成')
  } catch (error) {
    console.error('图片生成失败:', error)
    msg.generatingImages = false
    ElMessage.error('图片生成失败: ' + (error.message || '未知错误'))
  }

  scrollToBottom()
}

// 跳过图片生成
function skipImageGeneration(msgIndex) {
  const msg = aiMessages.value[msgIndex]
  if (!msg) return

  msg.imageTasksPending = false
  msg.imageTasks = []
  msg.content = aiMode.value === 'create'
    ? `已为您生成「${msg.generatedConfig.scene?.name || '新场景'}」的完整配置，包含 ${msg.generatedConfig.steps?.length || 0} 个步骤。已跳过图片生成，点击下方按钮可预览详情或直接应用。`
    : `已根据您的要求修改了场景配置。已跳过图片生成，点击下方按钮查看修改结果。`

  ElMessage.info('已跳过图片生成')
  scrollToBottom()
}

// 带进度回调的图片生成函数（并发版本）
async function generateConfigImagesWithProgress(config, tasks, onProgress) {
  try {
    const configCopy = JSON.parse(JSON.stringify(config))
    const CONCURRENCY = 5 // 并发数
    let taskIndex = 0

    // 1. 生成场景图标（单独处理）
    if (configCopy.scene?.icon_description) {
      onProgress(taskIndex, 'processing')
      try {
        const iconRes = await request.post('/ai-agent/generate-icon', {
          description: configCopy.scene.icon_description,
          type: 'scene',
          scene_id: configCopy.scene.scene_key,
          auto_upload: true
        })
        if (iconRes.code === 200 && iconRes.data?.url) {
          configCopy.scene.icon = iconRes.data.url
          onProgress(taskIndex, 'completed')
        } else {
          onProgress(taskIndex, 'failed')
        }
      } catch (e) {
        console.error('生成场景图标失败:', e)
        onProgress(taskIndex, 'failed')
      }
      taskIndex++
    }

    // 2. 收集所有需要生成的选项任务
    const optionTasks = []
    if (configCopy.steps && Array.isArray(configCopy.steps)) {
      for (const step of configCopy.steps) {
        if (step.component_type === 'image_upload') continue

        if (step.options && Array.isArray(step.options)) {
          for (const opt of step.options) {
            if (opt.image_description) {
              optionTasks.push({
                step,
                opt,
                taskIndex: taskIndex++,
                description: opt.image_description,
                step_key: step.step_key,
                option_key: opt.option_key
              })
            }
          }
        }
      }
    }

    // 3. 并发生成选项示意图
    const generateSingleOption = async (task) => {
      onProgress(task.taskIndex, 'processing')
      try {
        const imgRes = await request.post('/ai-agent/generate-icon', {
          description: task.description,
          type: 'step',
          scene_id: configCopy.scene?.scene_key,
          step_key: task.step_key,
          option_key: task.option_key,
          auto_upload: true
        })
        if (imgRes.code === 200 && imgRes.data?.url) {
          task.opt.image = imgRes.data.url
          onProgress(task.taskIndex, 'completed')
          return { success: true }
        } else {
          onProgress(task.taskIndex, 'failed')
          return { success: false }
        }
      } catch (e) {
        console.error(`生成选项 ${task.option_key} 示意图失败:`, e)
        onProgress(task.taskIndex, 'failed')
        return { success: false }
      }
    }

    // 分批并发处理
    for (let i = 0; i < optionTasks.length; i += CONCURRENCY) {
      const batch = optionTasks.slice(i, i + CONCURRENCY)
      console.log(`[并发生成] 批次 ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(optionTasks.length / CONCURRENCY)}, 任务数: ${batch.length}`)
      
      await Promise.all(batch.map(task => generateSingleOption(task)))
      
      // 批次间添加小延迟避免限流
      if (i + CONCURRENCY < optionTasks.length) {
        await new Promise(r => setTimeout(r, 200))
      }
    }

    return configCopy
  } catch (error) {
    console.error('生成配置图片失败:', error)
    throw error
  }
}

// 为 AI 生成的配置自动生成图标和示意图（保留旧函数以兼容）
async function generateConfigImages(config) {
  try {
    // 复制配置以避免修改原对象
    const configCopy = JSON.parse(JSON.stringify(config))
    console.log('[generateConfigImages] 开始生成图片, config:', configCopy)

    // 1. 生成场景图标
    if (configCopy.scene?.icon_description) {
      console.log('[generateConfigImages] 准备生成场景图标:', configCopy.scene.icon_description)
      try {
        const iconRes = await request.post('/ai-agent/generate-icon', {
          description: configCopy.scene.icon_description,
          type: 'scene',
          scene_id: configCopy.scene.scene_key,
          auto_upload: true
        })
        console.log('[generateConfigImages] 场景图标响应:', iconRes)
        if (iconRes.code === 200 && iconRes.data?.url) {
          configCopy.scene.icon = iconRes.data.url
          console.log('[generateConfigImages] 场景图标已设置:', iconRes.data.url)
        }
      } catch (e) {
        console.error('[generateConfigImages] 生成场景图标失败:', e)
      }
    } else {
      console.warn('[generateConfigImages] 没有 icon_description，跳过场景图标生成')
    }
    
    // 2. 生成步骤选项的示意图
    if (configCopy.steps && Array.isArray(configCopy.steps)) {
      console.log('[generateConfigImages] 开始遍历步骤，总数:', configCopy.steps.length)
      for (const step of configCopy.steps) {
        // 跳过上传步骤
        if (step.component_type === 'image_upload') {
          console.log(`[generateConfigImages] 跳过上传步骤: ${step.step_key}`)
          continue
        }

        // 为有 image_description 的选项生成示意图
        if (step.options && Array.isArray(step.options)) {
          console.log(`[generateConfigImages] 步骤 ${step.step_key} 有 ${step.options.length} 个选项`)
          for (const opt of step.options) {
            if (opt.image_description) {
              console.log(`[generateConfigImages] 准备生成选项示意图: ${opt.option_key}, 描述:`, opt.image_description)
              try {
                const imgRes = await request.post('/ai-agent/generate-icon', {
                  description: opt.image_description,
                  type: 'step',
                  scene_id: configCopy.scene?.scene_key,
                  step_key: step.step_key,
                  option_key: opt.option_key,
                  auto_upload: true
                })
                console.log(`[generateConfigImages] 选项 ${opt.option_key} 响应:`, imgRes)
                if (imgRes.code === 200 && imgRes.data?.url) {
                  opt.image = imgRes.data.url
                  console.log(`[generateConfigImages] 选项 ${opt.option_key} 图片已设置:`, imgRes.data.url)
                }
                // 添加小延迟避免限流
                await new Promise(r => setTimeout(r, 300))
              } catch (e) {
                console.error(`[generateConfigImages] 生成选项 ${opt.option_key} 示意图失败:`, e)
              }
            } else {
              console.log(`[generateConfigImages] 选项 ${opt.option_key} 没有 image_description`)
            }
          }
        }
      }
    }
    
    console.log('[generateConfigImages] 图片生成完成，最终配置:', configCopy)
    return configCopy
  } catch (error) {
    console.error('[generateConfigImages] 生成配置图片失败:', error)
    return config // 返回原配置
  }
}

// 发送 AI 消息
async function sendAIMessage() {
  const message = aiInput.value.trim()
  if (!message || aiLoading.value) return

  // 添加用户消息
  aiMessages.value.push({
    role: 'user',
    content: message
  })
  aiInput.value = ''
  aiLoading.value = true
  scrollToBottom()

  try {
    let response
    if (aiMode.value === 'create') {
      // 新建模式：调用生成场景 API
      response = await request.post('/ai-agent/generate-scene', {
        description: message,
        reference_scene: null
      })
    } else {
      // 修改模式：调用修改场景 API
      if (!currentScene.value) {
        throw new Error('请先选择要修改的场景')
      }
      // 构建当前场景的完整配置
      const currentConfig = {
        scene: {
          scene_key: currentScene.value.id,
          name: currentScene.value.name,
          name_en: currentScene.value.name_en,
          description: currentScene.value.description,
          description_en: currentScene.value.description_en,
          points_cost: currentScene.value.points_cost || currentScene.value.price,
          status: currentScene.value.status
        },
        steps: steps.value.map(s => ({
          step_key: s.step_key,
          title: s.title,
          title_en: s.title_en,
          component_type: s.component_type,
          is_required: s.is_required,
          is_visible: s.is_visible,
          gender_based: s.gender_based,
          options: s.options?.map(o => ({
            option_key: o.option_key,
            label: o.label,
            label_en: o.label_en,
            color: o.color,
            image: o.image,
            prompt_text: o.prompt_text,
            is_default: o.is_default
          }))
        })),
        prompt_template: {
          name: promptForm.name,
          template: promptForm.template,
          negative_prompt: promptForm.negative_prompt
        }
      }
      response = await request.post('/ai-agent/modify-scene', {
        current_config: currentConfig,
        instruction: message
      })
    }

    if (response.code === 200) {
      const config = response.data

      // 分析需要生成的图片任务
      const imageTasks = buildImageTasks(config)

      // 显示配置和待确认的图片任务列表
      aiMessages.value.push({
        role: 'assistant',
        content: aiMode.value === 'create'
          ? `已为您生成「${config.scene?.name || '新场景'}」的完整配置，包含 ${config.steps?.length || 0} 个步骤。检测到需要生成 ${imageTasks.length} 张图片，请确认是否继续。`
          : `已根据您的要求修改了场景配置。检测到需要生成 ${imageTasks.length} 张图片，请确认是否继续。`,
        generatedConfig: config,
        imageTasks: imageTasks,
        imageTasksPending: true,
        generatingImages: false
      })
      scrollToBottom()
    } else {
      aiMessages.value.push({
        role: 'assistant',
        content: `抱歉，生成失败：${response.message || '未知错误'}。请重试或换个描述方式。`
      })
    }
  } catch (error) {
    console.error('AI 请求失败:', error)
    aiMessages.value.push({
      role: 'assistant',
      content: `请求失败：${error.message || '网络错误'}。请检查网络连接后重试。`
    })
  } finally {
    aiLoading.value = false
    scrollToBottom()
  }
}

// 预览生成的配置
function previewGeneratedConfig(config) {
  aiPreviewConfig.value = config
  aiPreviewVisible.value = true
}

// 应用生成的配置
async function applyGeneratedConfig(config) {
  if (!config) return

  try {
    await ElMessageBox.confirm(
      aiMode.value === 'create'
        ? '确定要创建此场景吗？将自动保存场景基本信息、步骤和Prompt模板。'
        : '确定要应用这些修改吗？这将覆盖当前场景的配置。',
      '确认应用',
      { type: 'info' }
    )

    if (aiMode.value === 'create') {
      // 新建模式：创建新场景
      // 1. 先创建场景基本信息
      const sceneData = {
        scene_key: config.scene.scene_key,
        name: config.scene.name,
        name_en: config.scene.name_en || '',
        description: config.scene.description,
        description_en: config.scene.description_en || '',
        icon: config.scene.icon || '',  // 使用 AI 生成的图标
        status: 'inactive', // 新建的场景默认为未上线
        is_review_safe: config.scene.is_review_safe ? 1 : 0,
        points_cost: config.scene.points_cost || 50,
        price: config.scene.points_cost || 50,
        use_dynamic_render: 1
      }

      const createRes = await request.post('/config/admin/scene', sceneData)
      if (createRes.code !== 200 && createRes.code !== 0) {
        throw new Error(createRes.message || '创建场景失败')
      }

      // 2. 批量保存步骤和 Prompt
      const stepsData = config.steps?.map((step, idx) => ({
        step_key: step.step_key,
        title: step.title,
        title_en: step.title_en || '',
        component_type: step.component_type,
        step_order: idx + 1,
        is_required: step.is_required !== false,
        is_visible: step.is_visible !== false,
        gender_based: step.gender_based || false,
        free_count: step.free_count !== undefined ? step.free_count : 1,
        cost_per_roll: step.cost_per_roll !== undefined ? step.cost_per_roll : 10,
        icon: '',
        config: {},
        options: step.options?.map((opt, optIdx) => ({
          option_key: opt.option_key || `opt_${Date.now().toString(36)}_${optIdx}`,
          label: opt.label,
          label_en: opt.label_en || '',
          color: opt.color || '',
          image: opt.image || '',
          prompt_text: opt.prompt_text || opt.label,
          sort_order: optIdx + 1,
          is_visible: true,
          is_default: opt.is_default ? 1 : (optIdx === 0 ? 1 : 0),
          gender: opt.gender || null
        })) || []
      })) || []

      const promptData = config.prompt_template ? {
        name: config.prompt_template.name || `${config.scene.name}模板`,
        template: config.prompt_template.template || '',
        negative_prompt: config.prompt_template.negative_prompt || ''
      } : null

      await request.post(`/config/admin/scene/${config.scene.scene_key}/batch-save`, {
        steps: stepsData,
        prompt: promptData
      })

      ElMessage.success('场景创建成功！')
      aiSidebarVisible.value = false
      loadScenes()

    } else {
      // 修改模式：更新当前场景
      if (!currentScene.value) return

      // 更新场景基本信息
      Object.assign(form, {
        name: config.scene.name,
        name_en: config.scene.name_en,
        description: config.scene.description,
        description_en: config.scene.description_en,
        points_cost: config.scene.points_cost,
        icon: config.scene.icon || form.icon  // 使用 AI 生成的图标（如果有）
      })

      // 更新步骤配置
      steps.value = config.steps?.map((step, idx) => ({
        id: null, // 新步骤
        step_key: step.step_key,
        title: step.title,
        title_en: step.title_en || '',
        component_type: step.component_type,
        step_order: idx + 1,
        is_required: step.is_required !== false,
        is_visible: step.is_visible !== false,
        gender_based: step.gender_based || false,
        free_count: step.free_count !== undefined ? step.free_count : 1,
        cost_per_roll: step.cost_per_roll !== undefined ? step.cost_per_roll : 10,
        icon: '',
        config: {},
        options: step.options?.map((opt, optIdx) => ({
          option_key: opt.option_key || `opt_${Date.now().toString(36)}_${optIdx}`,
          label: opt.label,
          label_en: opt.label_en || '',
          color: opt.color || '',
          image: opt.image || '',
          prompt_text: opt.prompt_text || opt.label,
          sort_order: optIdx + 1,
          is_visible: 1,
          is_default: opt.is_default ? 1 : (optIdx === 0 ? 1 : 0),
          gender: opt.gender || null
        })) || []
      })) || []

      // 更新 Prompt 模板
      if (config.prompt_template) {
        promptForm.name = config.prompt_template.name || promptForm.name
        promptForm.template = config.prompt_template.template || ''
        promptForm.negative_prompt = config.prompt_template.negative_prompt || ''
      }

      currentStepIndex.value = steps.value.length > 0 ? 0 : -1
      ElMessage.success('配置已应用，请检查后保存')
      aiSidebarVisible.value = false
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('应用配置失败: ' + (e.message || '未知错误'))
    }
  }
}

// ========== 图像生成方法 ==========

// 生成单个图标
async function generateIcon() {
  if (!imageGenForm.description.trim()) {
    ElMessage.warning('请输入图标描述')
    return
  }

  imageGenLoading.value = true
  imageGenResult.value = null

  try {
    const response = await request.post('/ai-agent/generate-icon', {
      description: imageGenForm.description,
      type: imageGenForm.type,
      scene_id: currentScene.value?.id || null,
      auto_upload: true
    })

    if (response.code === 200) {
      imageGenResult.value = response.data
      ElMessage.success('图标生成成功！')
    } else {
      ElMessage.error(response.message || '生成失败')
    }
  } catch (error) {
    console.error('图标生成失败:', error)
    ElMessage.error('生成失败: ' + (error.message || '网络错误'))
  } finally {
    imageGenLoading.value = false
  }
}

// 批量生成步骤选项图标
async function batchGenerateIcons() {
  if (!batchGenStepKey.value) {
    ElMessage.warning('请选择步骤')
    return
  }

  const step = steps.value.find(s => s.step_key === batchGenStepKey.value)
  if (!step || !step.options || step.options.length === 0) {
    ElMessage.warning('该步骤没有选项')
    return
  }

  try {
    await ElMessageBox.confirm(
      `将为 "${step.title}" 的 ${step.options.length} 个选项生成图标，每个选项约需10-20秒，确定继续？`,
      '批量生成确认',
      { type: 'warning' }
    )
  } catch {
    return
  }

  batchGenLoading.value = true

  try {
    const options = step.options.map(opt => ({
      option_key: opt.option_key,
      label: opt.label,
      description: opt.prompt_text || opt.label
    }))

    const response = await request.post('/ai-agent/batch-generate-icons', {
      scene_id: currentScene.value?.id || 'unknown',
      step_key: step.step_key,
      options: options
    })

    if (response.code === 200) {
      const { success, failed } = response.data
      
      // 更新成功的选项图片
      success.forEach(result => {
        const opt = step.options.find(o => o.option_key === result.option_key)
        if (opt && result.url) {
          opt.image = result.url
        }
      })

      if (failed.length === 0) {
        ElMessage.success(`全部 ${success.length} 个图标生成成功！`)
      } else {
        ElMessage.warning(`${success.length} 个成功，${failed.length} 个失败`)
      }
    } else {
      ElMessage.error(response.message || '批量生成失败')
    }
  } catch (error) {
    console.error('批量生成失败:', error)
    ElMessage.error('批量生成失败: ' + (error.message || '网络错误'))
  } finally {
    batchGenLoading.value = false
  }
}

// 应用生成的图标到场景
function applyIconToScene() {
  if (imageGenResult.value?.url && currentScene.value) {
    form.icon = imageGenResult.value.url
    ElMessage.success('图标已应用，请保存场景')
  }
}

// 复制到剪贴板
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败')
  }
}

onMounted(() => {
  loadScenes()
  loadGradeSchemes()
})
</script>

<style scoped>
.scene-management {
  padding: 20px;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.header-right {
  flex-shrink: 0;
}

.page-header h2 {
  margin: 0;
  color: #303133;
  white-space: nowrap;
}

.subtitle {
  color: #909399;
  font-size: 14px;
  margin-left: 10px;
}

/* 状态筛选Tab */
.status-tabs {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.scene-count {
  color: #909399;
  font-size: 14px;
  white-space: nowrap;
}

.scene-list {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  overflow-x: auto;
  min-width: 0;
}

/* 确保表格可以滚动 */
.scene-list :deep(.el-table) {
  min-width: 700px;
}

.scene-list :deep(.el-table__body-wrapper) {
  overflow-x: auto;
}

.scene-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 场景图标样式 */
.scene-icon-img {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  flex-shrink: 0;
  background: #f5f7fa;
}

.image-placeholder {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 20px;
  font-weight: bold;
  border-radius: 8px;
}

.scene-detail {
  flex: 1;
  min-width: 0;
}

.scene-name {
  font-weight: 500;
  color: #303133;
  margin-bottom: 2px;
}

.scene-desc {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scene-key {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 2px;
}

.points-value {
  color: #E6A23C;
  font-weight: 600;
}

/* 状态三切控件 */
.status-switch {
  display: flex;
  gap: 4px;
  background: #f5f7fa;
  border-radius: 6px;
  padding: 3px;
}

.status-option {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  opacity: 0.5;
}

.status-option:hover {
  opacity: 0.8;
}

.status-option.active {
  background: #fff;
  opacity: 1;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.green {
  background: #67c23a;
  box-shadow: 0 0 4px #67c23a;
}

.status-dot.yellow {
  background: #e6a23c;
  box-shadow: 0 0 4px #e6a23c;
}

.status-dot.gray {
  background: #909399;
}

.status-text {
  font-size: 12px;
  color: #606266;
}

/* 拖动排序 */
.drag-handle {
  cursor: move;
  color: #909399;
  font-size: 16px;
  user-select: none;
}

.drag-handle:hover {
  color: #409EFF;
}

/* 操作按钮行 */
.action-btns-row {
  display: flex;
  gap: 4px;
  white-space: nowrap;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  margin-left: 8px;
}

/* 图标上传区域 */
.icon-upload-area {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}

.icon-preview {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  background: #f5f7fa;
}

.icon-placeholder {
  width: 80px;
  height: 80px;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 12px;
}

/* 图标上传对话框 */
.icon-upload-container {
  text-align: center;
}

.icon-uploader {
  width: 150px;
  height: 150px;
  margin: 0 auto;
}

.icon-uploader :deep(.el-upload) {
  border: 2px dashed #dcdfe6;
  border-radius: 12px;
  cursor: pointer;
  width: 150px;
  height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;
}

.icon-uploader :deep(.el-upload:hover) {
  border-color: #409EFF;
}

.uploaded-icon {
  width: 146px;
  height: 146px;
  border-radius: 10px;
}

.icon-uploader-icon {
  font-size: 40px;
  color: #dcdfe6;
}

.upload-tips {
  margin-top: 16px;
  text-align: center;
}

.upload-tips p {
  margin: 4px 0;
  font-size: 12px;
  color: #909399;
}

/* 内联图标上传 */
.icon-upload-inline {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.icon-uploader-inline :deep(.el-upload) {
  border: 2px dashed #dcdfe6;
  border-radius: 12px;
  cursor: pointer;
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;
}

.icon-uploader-inline :deep(.el-upload:hover) {
  border-color: #409EFF;
}

.icon-preview-inline {
  width: 96px;
  height: 96px;
  border-radius: 10px;
}

.icon-placeholder-inline {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 12px;
  gap: 4px;
}

.icon-placeholder-inline .el-icon {
  font-size: 24px;
  color: #dcdfe6;
}

.icon-upload-tips {
  font-size: 12px;
  color: #909399;
  line-height: 1.8;
}

.icon-upload-tips p {
  margin: 0;
}

/* ========== 三栏步骤配置布局 ========== */
.steps-config-3col {
  display: flex;
  gap: 16px;
  height: 520px;
  min-width: 0;
  overflow: hidden;
}

/* 左栏：步骤列表 */
.steps-sidebar {
  width: 200px;
  min-width: 160px;
  flex-shrink: 0;
  border-right: 1px solid #ebeef5;
  padding-right: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}

.steps-list-compact {
  flex: 1;
  overflow-y: auto;
}

.step-item-compact {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}

.step-item-compact:hover {
  border-color: #409EFF;
}

.step-item-compact.active {
  border-color: #409EFF;
  background: #ecf5ff;
}

.step-info-compact {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-title-compact {
  font-size: 13px;
  font-weight: 500;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 中栏：步骤基本配置 */
.step-basic-config {
  width: 280px;
  min-width: 220px;
  flex-shrink: 0;
  border-right: 1px solid #ebeef5;
  padding-right: 16px;
  overflow-y: auto;
  overflow-x: hidden;
}

.step-basic-empty {
  width: 280px;
  min-width: 220px;
  flex-shrink: 0;
  border-right: 1px solid #ebeef5;
  padding-right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.config-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.switch-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.switch-row .el-form-item {
  margin-bottom: 8px;
}

/* 摇骰子定价配置 */
.dice-pricing-config {
  display: flex;
  gap: 12px;
  background: #fef9e7;
  padding: 12px;
  border-radius: 6px;
  margin-bottom: 12px;
  border: 1px solid #f5d89a;
}

.dice-pricing-config .el-form-item {
  flex: 1;
  margin-bottom: 0;
}

.dice-pricing-config .el-form-item__label {
  font-size: 12px;
  color: #b88a00;
}

/* 右栏：选项配置 */
.step-options-config {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.step-options-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* random_dice 抽奖池配置样式 */
.random-dice-config {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px dashed #e0e0e0;
}

/* random_dice 独立配置（不在 options-scroll-area 内） */
.random-dice-config-standalone {
  padding: 10px 0;
}

.dice-config-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
}

.dice-config-header .config-label {
  font-size: 14px;
  color: #606266;
}

.dice-config-header .config-tip {
  font-size: 12px;
  color: #909399;
}

.dice-pool-manager {
  max-height: 400px;
  overflow-y: auto;
}

.grade-scheme-section {
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px dashed #e0e0e0;
}

.grade-scheme-section .section-title,
.dice-pool-manager .section-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
  margin-bottom: 10px;
  padding-left: 8px;
  border-left: 3px solid #409eff;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.grade-scheme-section .manage-link {
  text-decoration: none;
}

.grade-scheme-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.grade-scheme-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.grade-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.grade-preview-item {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
}

.grade-more {
  font-size: 12px;
  color: #909399;
  padding: 2px 8px;
}

/* 无需配置选项的组件提示 */
.no-options-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #909399;
  text-align: center;
}

.no-options-tip p {
  margin: 15px 0 8px;
  font-size: 16px;
  font-weight: 500;
  color: #606266;
}

.no-options-tip span {
  font-size: 13px;
}

.options-filter-compact {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  padding: 6px 10px;
  background: #f5f7fa;
  border-radius: 4px;
}

.spec-tip-compact {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  margin-bottom: 10px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 4px;
  color: #1890ff;
  font-size: 12px;
}

.options-scroll-area {
  flex: 1;
  overflow-y: auto;
  padding-right: 8px;
}

/* image_tags 水平布局：左图右标签 */
.image-tag-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  margin-bottom: 8px;
  background: #fafafa;
}

.image-tag-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.image-tag-btns {
  display: flex;
  gap: 4px;
}

.image-tag-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.image-tag-row1 {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px;
}

.image-tag-row2 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.image-tag-row2 label {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
  flex-shrink: 0;
}

.image-tag-row2 .el-input {
  flex: 1;
}

.image-tag-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.image-tag-field label {
  font-size: 11px;
  color: #909399;
  white-space: nowrap;
}

/* 选项卡片（image_tags用 - 保留兼容） */
.option-card {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  margin-bottom: 10px;
  background: #fafafa;
  overflow: hidden;
}

.option-card-header {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  background: #fff;
  border-bottom: 1px solid #ebeef5;
}

.option-thumb-uploader :deep(.el-upload) {
  border: 1px dashed #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.option-thumb-uploader :deep(.el-upload:hover) {
  border-color: #409EFF;
}

.option-thumb {
  width: 58px;
  height: 58px;
}

/* 图片选择器（点击从COS选择） */
.option-thumb-selector {
  width: 60px;
  height: 60px;
  border: 2px dashed #dcdfe6;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: all 0.2s;
}

.option-thumb-selector:hover {
  border-color: #409EFF;
  background: #ecf5ff;
}

.option-thumb {
  width: 56px;
  height: 56px;
}

.option-thumb-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
}

.option-thumb-empty .el-icon {
  font-size: 24px;
}

.option-thumb-selector:hover .option-thumb-empty {
  color: #409EFF;
}

.option-card-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.option-card-body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.option-card-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

/* 选项行（tags等用） */
.option-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  margin-bottom: 6px;
  background: #fafafa;
}

/* 规格选项行 */
.spec-option-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  margin-bottom: 6px;
  background: #fafafa;
}

.spec-row-main {
  display: flex;
  gap: 6px;
}

.spec-row-size {
  display: flex;
  align-items: center;
  gap: 4px;
}

.spec-row-size span {
  color: #909399;
  font-size: 12px;
}

.spec-row-extra {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 保留旧样式兼容 */
.step-order {
  background: #409EFF;
  color: #fff;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}

.add-step-btn {
  width: 100%;
  margin-top: 8px;
}

.options-count {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
}

.size-unit {
  color: #909399;
  font-size: 11px;
  margin-left: 2px;
}

.filter-label {
  font-size: 13px;
  color: #606266;
}

.options-count {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
}

.options-list {
  max-height: 400px;
  overflow-y: auto;
  padding-right: 8px;
}

.option-item {
  padding: 8px;
  border: 1px solid #eee;
  border-radius: 4px;
  margin-bottom: 8px;
}

/* 规格选项尺寸输入 */
.spec-option {
  background: #fafbfc;
}

/* spec_select 表格布局 */
.spec-table-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 4px 4px 0 0;
  font-size: 12px;
  font-weight: 500;
  color: #606266;
}

.spec-table-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #ebeef5;
  border-top: none;
  background: #fafafa;
}

.spec-table-row:last-child {
  border-radius: 0 0 4px 4px;
}

.spec-table-row:hover {
  background: #f5f7fa;
}

.spec-col {
  flex-shrink: 0;
  text-align: center;
}

.spec-col-label {
  width: 90px;
}

.spec-col-size {
  width: 70px;
}

.spec-col-default {
  width: 50px;
}

.spec-col-action {
  width: 50px;
}

/* tags 表格布局 */
.tags-table-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 4px 4px 0 0;
  font-size: 12px;
  font-weight: 500;
  color: #606266;
}

.tags-table-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #ebeef5;
  border-top: none;
  background: #fafafa;
}

.tags-table-row:last-child {
  border-radius: 0 0 4px 4px;
}

.tags-table-row:hover {
  background: #f5f7fa;
}

.tags-col {
  flex-shrink: 0;
  text-align: center;
}

.tags-col-label {
  width: 90px;
}

.tags-col-prompt {
  flex: 1;
  min-width: 120px;
}

.tags-col-default {
  width: 50px;
}

.tags-col-action {
  width: 50px;
}

/* 通用选项表格布局 */
.common-table-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 4px 4px 0 0;
  font-size: 12px;
  font-weight: 500;
  color: #606266;
}

.common-table-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid #ebeef5;
  border-top: none;
  background: #fafafa;
}

.common-table-row:last-child {
  border-radius: 0 0 4px 4px;
}

.common-table-row:hover {
  background: #f5f7fa;
}

.common-col {
  flex-shrink: 0;
  text-align: center;
}

.common-col-label {
  width: 80px;
}

.common-col-extra {
  width: 80px;
}

.common-col-prompt {
  flex: 1;
  min-width: 100px;
}

.common-col-default {
  width: 50px;
}

.common-col-action {
  width: 50px;
}

.spec-header {
  padding: 8px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 4px 4px 0 0;
  margin-bottom: 0;
}

.spec-header + .option-item {
  border-top: none;
  border-radius: 0;
}

.header-label {
  font-size: 12px;
  font-weight: 500;
  color: #606266;
}

.spec-select-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 4px;
  color: #1890ff;
  font-size: 13px;
}

.spec-select-tip .el-icon {
  font-size: 16px;
}

.size-inputs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.size-separator {
  color: #909399;
  font-size: 12px;
}

.size-unit {
  color: #909399;
  font-size: 11px;
  margin-left: 2px;
}

.template-vars {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.template-vars .el-tag {
  margin-left: 5px;
  cursor: pointer;
}

/* image_tags 专用选项样式 */
.image-tag-option {
  display: flex;
  gap: 16px;
  padding: 12px;
  background: #fafafa;
}

.option-image-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.option-image-uploader :deep(.el-upload) {
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  cursor: pointer;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;
  overflow: hidden;
}

.option-image-uploader :deep(.el-upload:hover) {
  border-color: #409EFF;
}

.option-image-preview {
  width: 76px;
  height: 76px;
}

.option-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #dcdfe6;
  font-size: 20px;
}

.option-info-section {
  flex: 1;
  min-width: 0;
}

/* COS图片选择器样式 */
.cos-picker {
  min-height: 400px;
}

.cos-picker-header {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.cos-filter-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 4px;
}

.filter-result {
  font-size: 13px;
  color: #606266;
}

.cos-image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  max-height: 420px;
  overflow-y: auto;
  padding: 4px;
}

.cos-image-item {
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  background: #f5f7fa;
}

.cos-image-item:hover {
  border-color: #409EFF;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.cos-image-item.selected {
  border-color: #409EFF;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.cos-image-item .el-image {
  width: 100%;
  height: 100px;
  display: block;
}

.cos-image-info {
  padding: 6px 8px;
  background: #fff;
}

.cos-image-name {
  font-size: 11px;
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.cos-image-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.cos-image-tags .el-tag {
  transform: scale(0.85);
  transform-origin: left center;
}

/* 步骤图标选择器 */
.step-icon-selector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.step-icon-preview {
  width: 48px;
  height: 48px;
  border: 2px dashed #dcdfe6;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.2s;
  overflow: hidden;
}

.step-icon-preview:hover {
  border-color: #409EFF;
}

.step-icon-img {
  width: 44px;
  height: 44px;
  object-fit: contain;
}

.step-icon-empty {
  color: #dcdfe6;
  font-size: 20px;
}

/* 步骤图标选择对话框 */
.step-icon-picker {
  min-height: 300px;
}

.step-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 12px;
  max-height: 350px;
  overflow-y: auto;
}

.step-icon-item {
  text-align: center;
  padding: 10px 6px;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: #f5f7fa;
}

.step-icon-item:hover {
  border-color: #409EFF;
  background: #ecf5ff;
}

.step-icon-item.selected {
  border-color: #409EFF;
  background: #ecf5ff;
}

.step-icon-item img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.step-icon-name {
  font-size: 10px;
  color: #909399;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 场景图标选择器（表单中） */
.scene-icon-selector {
  width: 100px;
  height: 100px;
  border: 2px dashed #dcdfe6;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  overflow: hidden;
  flex-shrink: 0;
}

.scene-icon-selector:hover {
  border-color: #409EFF;
  background: #ecf5ff;
}

.icon-upload-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

/* 场景图标选择对话框 */
.scene-icon-picker {
  min-height: 400px;
}

.scene-icon-picker-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.scene-icon-count {
  font-size: 13px;
  color: #909399;
}

.scene-icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
  max-height: 420px;
  overflow-y: auto;
  padding: 4px;
}

.scene-icon-item {
  border: 2px solid transparent;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  background: #f5f7fa;
}

.scene-icon-item:hover {
  border-color: #409EFF;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.scene-icon-item.selected {
  border-color: #409EFF;
  box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
}

.scene-icon-item .el-image {
  width: 100%;
  height: 80px;
  display: block;
}

.scene-icon-info {
  padding: 6px 8px;
  background: #fff;
}

.scene-icon-info .scene-icon-name {
  font-size: 11px;
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.scene-icon-tags {
  display: flex;
  gap: 4px;
}

.scene-icon-tags .el-tag {
  transform: scale(0.85);
  transform-origin: left center;
}

/* ========== 翻译功能样式 ========== */
.input-with-translate {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.input-with-translate .el-input,
.input-with-translate .el-textarea {
  flex: 1;
}

.input-with-translate-compact {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-with-translate-compact .el-input {
  flex: 1;
}

.translate-btn {
  flex-shrink: 0;
  margin-top: 6px;
}

.config-title-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.field-with-btn {
  display: flex;
  align-items: center;
  gap: 2px;
}

.field-with-btn-inline {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
}

.field-with-btn-inline .el-input {
  flex: 1;
}

.mini-translate-btn {
  padding: 2px !important;
  min-width: auto !important;
  flex-shrink: 0;
}

.mini-translate-btn .el-icon {
  margin: 0 !important;
}

/* 调整表格列宽以适应翻译按钮 */
.tags-col-label-main {
  width: 110px;
}

.spec-col-label-main {
  width: 110px;
}

.common-col-label-main {
  width: 100px;
}

/* ========== AI 助手样式 ========== */

/* 浮动按钮 */
.ai-assistant-fab {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  z-index: 100;
  overflow: hidden;
}

.ai-assistant-fab:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
  width: 120px;
}

.ai-assistant-fab .fab-label {
  width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  margin-left: 0;
  transition: all 0.3s ease;
}

.ai-assistant-fab:hover .fab-label {
  width: auto;
  margin-left: 8px;
}

.ai-assistant-fab.active {
  background: linear-gradient(135deg, #764ba2 0%, #667eea 100%);
}

/* AI 侧边栏内容 */
.ai-sidebar-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ai-mode-switch {
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
  background: #fafbfc;
}

.ai-current-scene {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #e6f7ff;
  border-bottom: 1px solid #91d5ff;
  font-size: 13px;
  color: #1890ff;
}

/* 对话历史区域 */
.ai-chat-history {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #f5f7fa;
}

.ai-welcome {
  text-align: center;
  padding: 40px 20px;
}

.ai-welcome .welcome-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.ai-welcome h3 {
  margin: 0 0 8px;
  color: #303133;
  font-size: 18px;
}

.ai-welcome p {
  color: #909399;
  font-size: 14px;
  margin: 0;
}

.ai-suggestions {
  margin-top: 24px;
  text-align: left;
}

.ai-suggestions .suggestion-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 10px;
}

.ai-suggestions .suggestion-item {
  padding: 10px 14px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 13px;
  color: #606266;
  cursor: pointer;
  transition: all 0.2s;
}

.ai-suggestions .suggestion-item:hover {
  border-color: #409EFF;
  background: #ecf5ff;
  color: #409EFF;
}

/* 消息样式 */
.ai-message {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.ai-message.user {
  flex-direction: row-reverse;
}

.ai-message .message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.ai-message.user .message-avatar {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.ai-message .message-content {
  max-width: 80%;
}

.ai-message .message-text {
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.ai-message.user .message-text {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ai-message.assistant .message-text {
  background: #fff;
  color: #303133;
  border-bottom-left-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* AI 配置预览卡片 */
.ai-config-preview {
  margin-top: 12px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.config-preview-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #409EFF;
  margin-bottom: 8px;
}

.config-preview-info {
  font-size: 12px;
  color: #606266;
  margin-bottom: 10px;
}

.config-preview-info div {
  margin-bottom: 4px;
}

.config-preview-actions {
  display: flex;
  gap: 8px;
}

.generating-images-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #409EFF;
  font-size: 12px;
  margin-top: 8px;
}

.generating-images-hint .is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 图片生成任务列表样式 */
.image-tasks-pending {
  margin-top: 12px;
  padding: 12px;
  background: #f0f7ff;
  border-radius: 8px;
  border: 1px solid #d0e5ff;
}

.image-tasks-pending .tasks-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #409EFF;
  margin-bottom: 10px;
}

.image-tasks-pending .tasks-list {
  max-height: 150px;
  overflow-y: auto;
  margin-bottom: 12px;
}

.image-tasks-pending .task-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: #606266;
  background: white;
  border-radius: 4px;
}

.image-tasks-pending .task-item .el-icon {
  color: #909399;
}

.image-tasks-pending .tasks-confirm {
  display: flex;
  gap: 8px;
}

/* 图片生成进度样式 */
.generating-images-progress {
  margin-top: 12px;
  padding: 12px;
  background: #f0f9eb;
  border-radius: 8px;
  border: 1px solid #c2e7b0;
}

.generating-images-progress .progress-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: #67C23A;
  margin-bottom: 10px;
}

.generating-images-progress .progress-tasks {
  max-height: 150px;
  overflow-y: auto;
}

.generating-images-progress .progress-task-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin-bottom: 4px;
  font-size: 12px;
  color: #606266;
  background: white;
  border-radius: 4px;
  transition: all 0.3s;
}

.generating-images-progress .progress-task-item.pending {
  color: #909399;
}

.generating-images-progress .progress-task-item.pending .el-icon {
  color: #909399;
}

.generating-images-progress .progress-task-item.processing {
  color: #409EFF;
  background: #ecf5ff;
}

.generating-images-progress .progress-task-item.processing .el-icon {
  color: #409EFF;
}

.generating-images-progress .progress-task-item.completed {
  color: #67C23A;
}

.generating-images-progress .progress-task-item.completed .el-icon {
  color: #67C23A;
}

.generating-images-progress .progress-task-item.failed {
  color: #F56C6C;
}

.generating-images-progress .progress-task-item.failed .el-icon {
  color: #F56C6C;
}

.no-icon-hint {
  color: #909399;
  font-size: 12px;
}

.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}

.option-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 80px;
}

.option-preview-image {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid #ebeef5;
}

.option-no-image {
  width: 60px;
  height: 60px;
  border-radius: 8px;
  background: #f5f7fa;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c0c4cc;
  font-size: 24px;
}

.option-label {
  font-size: 12px;
  color: #606266;
  text-align: center;
  margin-top: 4px;
  word-break: break-all;
}

/* 加载动画 */
.message-loading {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 12px;
  border-bottom-left-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.message-loading span {
  width: 8px;
  height: 8px;
  background: #909399;
  border-radius: 50%;
  animation: loading-bounce 1.4s ease-in-out infinite both;
}

.message-loading span:nth-child(1) {
  animation-delay: -0.32s;
}

.message-loading span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes loading-bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

/* 输入区域 */
.ai-input-area {
  padding: 16px;
  border-top: 1px solid #ebeef5;
  background: #fff;
}

.ai-input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
}

.ai-input-actions .input-hint {
  font-size: 12px;
  color: #c0c4cc;
}

/* AI 配置预览对话框 */
.ai-config-detail {
  max-height: 500px;
  overflow-y: auto;
}

.preview-step-card {
  padding: 12px;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  margin-bottom: 10px;
  background: #fafbfc;
}

.preview-step-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.preview-step-header .step-num {
  width: 24px;
  height: 24px;
  background: #409EFF;
  color: #fff;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.preview-step-header .step-name {
  font-weight: 500;
  color: #303133;
}

.preview-step-options {
  padding-left: 34px;
}

.preview-prompt {
  font-size: 13px;
}

.preview-prompt .prompt-label {
  font-weight: 500;
  color: #303133;
  margin-bottom: 8px;
  margin-top: 16px;
}

.preview-prompt .prompt-label:first-child {
  margin-top: 0;
}

.preview-prompt pre {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
  color: #606266;
  margin: 0;
}

/* ========== 图像生成模式样式 ========== */
.ai-image-generator {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.image-gen-form {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.image-gen-result {
  background: #f0f9eb;
  border: 1px solid #b3e19d;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.result-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  color: #67c23a;
  margin-bottom: 12px;
}

.result-preview {
  display: flex;
  justify-content: center;
  padding: 16px;
  background: repeating-conic-gradient(#e0e0e0 0% 25%, white 0% 50%) 50% / 20px 20px;
  border-radius: 8px;
  margin-bottom: 12px;
}

.generated-image {
  max-width: 200px;
  max-height: 200px;
  border-radius: 8px;
}

.result-info {
  margin-bottom: 12px;
}

.result-url {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.result-url .label {
  font-size: 12px;
  color: #909399;
}

.result-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.batch-gen-section {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.batch-tip {
  font-size: 13px;
  color: #909399;
  margin: 0 0 12px;
}

/* 在选项配置中添加AI生成按钮的样式 */
.ai-gen-btn {
  margin-left: auto;
}
</style>
