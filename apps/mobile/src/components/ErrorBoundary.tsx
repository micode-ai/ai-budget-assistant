import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { reportClientError } from '@/services/clientErrors';
import { shortErrorMessage } from '@/services/clientErrorReport';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  /** The error message, shortened, shown under the subtitle so a user's
   *  screenshot tells support what broke (ABA-832). */
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: shortErrorMessage(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
    // Never throws; deduped per session, so a crash on every "Try Again" is sent once.
    void reportClientError({ error, componentStack: info.componentStack, fatal: false });
  }

  private handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>:(</Text>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={[styles.subtitle, this.state.message ? styles.subtitleWithDetail : null]}>
            The app encountered an unexpected error.
          </Text>
          {this.state.message ? (
            <Text style={styles.detail} selectable numberOfLines={4}>
              {this.state.message}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
    padding: 32,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 16,
    color: '#F39237',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 24,
  },
  subtitleWithDetail: {
    marginBottom: 8,
  },
  detail: {
    fontSize: 12,
    color: '#7C8BA1',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#F39237',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 12,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
});
