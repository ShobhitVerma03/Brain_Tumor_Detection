pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Validate configuration') {
      steps {
        script {
          if (isUnix()) {
            sh 'docker compose config --quiet'
          } else {
            bat 'docker compose config --quiet'
          }
        }
      }
    }

    stage('Build application images') {
      steps {
        script {
          if (isUnix()) {
            sh 'docker compose build'
          } else {
            bat 'docker compose build'
          }
        }
      }
    }

    stage('Deploy locally') {
      steps {
        script {
          if (isUnix()) {
            sh 'docker compose down --remove-orphans || true\ndocker compose up -d --remove-orphans'
          } else {
            bat 'docker compose down --remove-orphans\ndocker compose up -d --remove-orphans'
          }
        }
      }
    }

    stage('Run end-to-end checks') {
      steps {
        script {
          if (isUnix()) {
            sh 'node tests/e2e.mjs'
          } else {
            bat 'node tests\\e2e.mjs'
          }
        }
      }
    }
  }

  post {
    always {
      script {
        if (isUnix()) {
          sh 'docker compose ps || true'
        } else {
          bat 'docker compose ps'
        }
      }
    }
    failure {
      script {
        if (isUnix()) {
          sh 'docker compose logs --tail=150 || true'
        } else {
          bat 'docker compose logs --tail=150'
        }
      }
    }
  }
}
